use super::*;
use crate::hql::{compile_source_for, Protocol};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Arc,
};
use std::thread::{self, JoinHandle};

/// Scripted loopback fixture. Drop interrupts accept and joins the worker,
/// including when an assertion fails or a client request times out.
struct HttpServer {
    address: SocketAddr,
    request: mpsc::Receiver<String>,
    stopped: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
}

impl HttpServer {
    fn new(status: u16, body: &str, delay: Duration) -> Self {
        Self::scripted(vec![Some((status, body.to_owned(), delay))])
    }

    // None closes the connection after receiving the complete request.
    fn scripted(responses: Vec<Option<(u16, String, Duration)>>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        listener.set_nonblocking(true).unwrap();
        let stopped = Arc::new(AtomicBool::new(false));
        let worker_stopped = Arc::clone(&stopped);
        let (sender, request) = mpsc::channel();
        let mut responses = std::collections::VecDeque::from(responses);
        let worker = thread::spawn(move || {
            while !worker_stopped.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((mut stream, _)) => {
                        stream
                            .set_read_timeout(Some(Duration::from_secs(2)))
                            .unwrap();
                        let Some(request) = read_request(&mut stream) else {
                            // A timed-out client can close before its request arrives.
                            continue;
                        };
                        let _ = sender.send(request);
                        if let Some((status, body, delay)) = responses.pop_front().flatten() {
                            thread::sleep(delay);
                            // A timeout may close the client before the response.
                            let _ = write!(stream, "HTTP/1.1 {status} Test\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
                        }
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

fn read_request(stream: &mut TcpStream) -> Option<String> {
    let mut bytes = Vec::new();
    let mut buffer = [0; 1024];
    loop {
        let count = stream.read(&mut buffer).ok()?;
        if count == 0 {
            return None;
        }
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
                return String::from_utf8(bytes).ok();
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

#[test]
fn unverified_servers_receive_no_write_requests() {
    for protocol in [crate::hql::Protocol::LegacyV1, crate::hql::Protocol::V2] {
        let server = HttpServer::new(200, "{}", Duration::ZERO);
        let conn = Connection {
            protocol,
            ..server.connection()
        };
        let compiled = compile_source_for(
            "INSERT INTO NODES:User DEFAULT VALUES RETURNING *",
            protocol,
        )
        .unwrap();
        let view = compiled_view(&compiled, &conn).unwrap();
        assert_eq!(view.execution_kind, "write");
        assert_eq!(
            view.transport_json.is_empty(),
            protocol == Protocol::LegacyV1
        );
        let error = runtime()
            .block_on(execute_compiled(&reqwest::Client::new(), &conn, &compiled))
            .unwrap_err();
        let payload = serde_json::to_value(error).unwrap();
        assert_eq!(payload["code"], "unsupported_mutation_protocol");
        if protocol == Protocol::V2 {
            assert!(server
                .received()
                .starts_with("GET /v2/mutation-capabilities "));
        } else {
            assert!(server
                .request
                .recv_timeout(Duration::from_millis(40))
                .is_err());
        }
    }
}

#[test]
fn mutation_transport_does_not_retry_and_preserves_commit_certainty() {
    let capability = serde_json::json!({
        "contract": "atlas-mutation-v1",
        "upstream_commit": "c72e64f0c7e480f3d125f071659d5e3ad7b8da15",
        "mode": "writer",
        "ready": true
    })
    .to_string();
    let guard = r#"{"error":"invalid_query","msg":"atlas_single_node: `__s1_r2_source` requires exactly one node, found 0"}"#;
    for (reply, expected, code) in [
        (None, "unknown", "mutation_outcome_unknown"),
        (
            Some((200, "invalid JSON")),
            "committedWithResultError",
            "mutation_result_error",
        ),
        (
            Some((500, r#"{"error":"internal","msg":"proxy failed"}"#)),
            "unknown",
            "mutation_outcome_unknown",
        ),
        (Some((500, guard)), "rolledBack", "mutation_rolled_back"),
        (
            Some((307, "redirect")),
            "unknown",
            "mutation_outcome_unknown",
        ),
    ] {
        let server = HttpServer::scripted(vec![
            Some((200, capability.clone(), Duration::ZERO)),
            reply.map(|(status, body)| (status, body.to_owned(), Duration::ZERO)),
        ]);
        let conn = Connection {
            url: format!("http://{}/gateway", server.address),
            api_key: Some("mutation-test-secret".into()),
            deployment: Deployment::SharedCloud,
            database_id: Some("mutation-db".into()),
            writer_only: false,
            ..server.connection()
        };
        let compiled =
            compile_source_for("INSERT INTO NODES:N DEFAULT VALUES", Protocol::V2).unwrap();
        let error = runtime()
            .block_on(execute_compiled(&reqwest::Client::new(), &conn, &compiled))
            .unwrap_err();
        let payload = serde_json::to_value(error).unwrap();
        assert_eq!(payload["outcome"], expected);
        assert_eq!(payload["code"], code);
        if expected == "rolledBack" {
            assert_eq!(payload["statementIndex"], 1);
            assert_eq!(payload["tupleIndex"], 2);
        }
        let capability_request = server.received();
        assert!(capability_request.starts_with("GET /gateway/v2/mutation-capabilities "));
        let request = server.received();
        assert!(request.starts_with("POST /gateway/v2/query "));
        let (headers, body) = request.split_once("\r\n\r\n").unwrap();
        let headers = headers.to_ascii_lowercase();
        for request_headers in [&headers, &capability_request.to_ascii_lowercase()] {
            assert!(request_headers.contains("authorization: bearer mutation-test-secret"));
            assert!(request_headers.contains("x-helix-database-id: mutation-db"));
        }
        assert!(headers.contains("x-helix-require-writer: true"));
        assert!(headers.contains("x-helix-await-durable: false"));
        assert_eq!(body, compiled.transport_json);
        assert!(
            server
                .request
                .recv_timeout(Duration::from_millis(40))
                .is_err(),
            "unexpected retry or fallback"
        );
    }
}
