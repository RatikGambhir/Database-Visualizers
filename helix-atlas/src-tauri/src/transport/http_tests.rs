use super::*;
use crate::hql::{compile_source_for, Protocol};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Arc,
};
use std::thread::{self, JoinHandle};

/// One-request loopback fixture. Drop interrupts accept and joins the worker,
/// including when an assertion fails or a client request times out.
struct HttpServer {
    address: SocketAddr,
    request: mpsc::Receiver<String>,
    stopped: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
}

impl HttpServer {
    fn new(status: u16, body: &str, delay: Duration) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        listener.set_nonblocking(true).unwrap();
        let stopped = Arc::new(AtomicBool::new(false));
        let worker_stopped = Arc::clone(&stopped);
        let (sender, request) = mpsc::channel();
        let body = body.to_owned();
        let worker = thread::spawn(move || {
            while !worker_stopped.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((mut stream, _)) => {
                        stream
                            .set_read_timeout(Some(Duration::from_secs(2)))
                            .unwrap();
                        let request = read_request(&mut stream);
                        let _ = sender.send(request);
                        thread::sleep(delay);
                        // A timeout may close the client before the response.
                        let _ = write!(stream, "HTTP/1.1 {status} Test\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
                        return;
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(5))
                    }
                    Err(error) => panic!("accept failed: {error}"),
                }
            }
        });
        Self {
            address,
            request,
            stopped,
            worker: Some(worker),
        }
    }

    fn connection(&self) -> Connection {
        Connection {
            url: format!("http://{}", self.address),
            ..Connection::default()
        }
    }

    fn received(&self) -> String {
        self.request.recv_timeout(Duration::from_secs(2)).unwrap()
    }
}

impl Drop for HttpServer {
    fn drop(&mut self) {
        self.stopped.store(true, Ordering::Relaxed);
        if let Some(worker) = self.worker.take() {
            worker.join().unwrap();
        }
    }
}

fn read_request(stream: &mut TcpStream) -> String {
    let mut bytes = Vec::new();
    let mut buffer = [0; 1024];
    loop {
        let count = stream.read(&mut buffer).unwrap();
        assert!(
            count > 0,
            "client closed before sending the complete request"
        );
        bytes.extend_from_slice(&buffer[..count]);
        if let Some(header_end) = bytes.windows(4).position(|part| part == b"\r\n\r\n") {
            let headers = String::from_utf8_lossy(&bytes[..header_end]);
            let length: usize = headers
                .lines()
                .find_map(|line| {
                    let (name, value) = line.split_once(':')?;
                    name.eq_ignore_ascii_case("content-length")
                        .then(|| value.trim().parse().unwrap())
                })
                .unwrap_or(0);
            if bytes.len() >= header_end + 4 + length {
                return String::from_utf8(bytes).unwrap();
            }
        }
    }
}

fn runtime() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
}

#[test]
fn sends_the_compiled_body_and_scoped_headers_over_http() {
    let server = HttpServer::new(200, r#"{"rows":3}"#, Duration::ZERO);
    let conn = Connection {
        api_key: Some("test-secret".into()),
        deployment: Deployment::SharedCloud,
        database_id: Some("test-db".into()),
        writer_only: true,
        ..server.connection()
    };
    let compiled = compile_source_for("SELECT COUNT(*) FROM NODES", Protocol::V2).unwrap();
    let (result, _) = runtime()
        .block_on(execute_compiled(&reqwest::Client::new(), &conn, &compiled))
        .unwrap();
    assert_eq!(
        serde_json::to_value(result).unwrap(),
        serde_json::json!({"kind":"count","value":3})
    );
    let request = server.received();
    let (headers, body) = request.split_once("\r\n\r\n").unwrap();
    assert!(headers.starts_with("POST /v2/query HTTP/1.1"));
    let headers = headers.to_ascii_lowercase();
    assert!(headers.contains("authorization: bearer test-secret"));
    assert!(headers.contains("x-helix-database-id: test-db"));
    assert!(headers.contains("x-helix-require-writer: true"));
    assert!(!headers.contains("x-helix-await-durable"));
    assert_eq!(body, compiled.transport_json);
}

#[test]
fn received_http_errors_retain_status_code_and_body_for_ipc() {
    for status in [401, 429, 503] {
        let body = r#"{"error":"unavailable","msg":"try later"}"#;
        let server = HttpServer::new(status, body, Duration::ZERO);
        let compiled = compile_source_for("SELECT COUNT(*) FROM NODES", Protocol::V2).unwrap();
        let error = runtime()
            .block_on(execute_compiled(
                &reqwest::Client::new(),
                &server.connection(),
                &compiled,
            ))
            .unwrap_err();
        let payload = serde_json::to_value(error).unwrap();
        assert_eq!(payload["status"], status);
        assert_eq!(payload["code"], "unavailable");
        assert_eq!(payload["detail"], body);
    }
}

#[test]
fn malformed_success_body_reports_a_result_error() {
    let server = HttpServer::new(200, "not JSON", Duration::ZERO);
    let compiled = compile_source_for("SELECT COUNT(*) FROM NODES", Protocol::V2).unwrap();
    let error = runtime()
        .block_on(execute_compiled(
            &reqwest::Client::new(),
            &server.connection(),
            &compiled,
        ))
        .unwrap_err();
    assert!(matches!(error, AppError::Result(_)));
}

#[test]
fn slow_response_reports_the_clamped_timeout() {
    let server = HttpServer::new(200, "{}", Duration::from_millis(1200));
    let conn = Connection {
        timeout_ms: 1,
        ..server.connection()
    };
    let error = runtime()
        .block_on(post_query(&reqwest::Client::new(), &conn, "{}".into()))
        .unwrap_err();
    assert!(matches!(error, AppError::Timeout(1000)));
    assert_eq!(serde_json::to_value(error).unwrap()["kind"], "transport");
}

#[test]
fn refused_connection_reports_the_endpoint_and_underlying_cause() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    drop(listener);
    let conn = Connection {
        url: url.clone(),
        ..Connection::default()
    };
    let error = runtime()
        .block_on(post_query(&reqwest::Client::new(), &conn, "{}".into()))
        .unwrap_err();
    match error {
        AppError::Unreachable {
            url: failed_url,
            reason,
        } => {
            assert_eq!(failed_url, url);
            assert!(!reason.is_empty());
        }
        other => panic!("expected unreachable, got {other:?}"),
    }
}
