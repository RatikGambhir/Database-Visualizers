use std::path::Path;

use regex::Regex;
use sqlx::{
    mysql::{MySqlPool, MySqlPoolOptions},
    postgres::{PgPool, PgPoolOptions},
    sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions},
};

#[derive(Clone)]
pub enum DatabasePool {
    Sqlite(SqlitePool),
    Postgres(PgPool),
    MySql(MySqlPool),
}

#[derive(Clone)]
pub struct StoredConnection {
    pub pool: DatabasePool,
    pub name: String,
    pub kind: String,
    pub read_only: bool,
}

pub async fn open_pool(
    kind: &str,
    path: Option<&str>,
    url: Option<&str>,
    read_only: bool,
) -> Result<(DatabasePool, String), String> {
    match kind {
        "sqlite" => {
            let path = path.ok_or("Choose a SQLite database file.")?;
            if read_only && !Path::new(path).exists() {
                return Err(format!("Database file does not exist: {path}"));
            }
            let options = SqliteConnectOptions::new()
                .filename(path)
                .read_only(read_only)
                .create_if_missing(!read_only)
                .foreign_keys(true);
            let pool = SqlitePoolOptions::new()
                .max_connections(4)
                .connect_with(options)
                .await
                .map_err(clean_error)?;
            Ok((DatabasePool::Sqlite(pool), path.to_string()))
        }
        "postgres" => {
            let url = url.ok_or("A PostgreSQL connection URL is required.")?;
            let pool = PgPoolOptions::new()
                .max_connections(5)
                .acquire_timeout(std::time::Duration::from_secs(12))
                .connect(url)
                .await
                .map_err(clean_error)?;
            Ok((DatabasePool::Postgres(pool), redact_url(url)))
        }
        "mysql" => {
            let url = url.ok_or("A MySQL connection URL is required.")?;
            let pool = MySqlPoolOptions::new()
                .max_connections(5)
                .acquire_timeout(std::time::Duration::from_secs(12))
                .connect(url)
                .await
                .map_err(clean_error)?;
            Ok((DatabasePool::MySql(pool), redact_url(url)))
        }
        _ => Err(format!("Unsupported database kind: {kind}")),
    }
}

pub async fn close_pool(pool: DatabasePool) {
    match pool {
        DatabasePool::Sqlite(pool) => pool.close().await,
        DatabasePool::Postgres(pool) => pool.close().await,
        DatabasePool::MySql(pool) => pool.close().await,
    }
}

pub fn clean_error(error: sqlx::Error) -> String {
    match error {
        sqlx::Error::Database(database) => database.message().to_string(),
        sqlx::Error::PoolTimedOut => {
            "Connection timed out. Check the host, port, and firewall settings.".into()
        }
        sqlx::Error::Io(io) => format!("Network or file error: {io}"),
        other => other.to_string(),
    }
}

fn redact_url(url: &str) -> String {
    Regex::new(r"(?P<scheme>^[a-zA-Z][a-zA-Z0-9+.-]*://)(?P<user>[^:/@]+)(?::[^@]*)?@")
        .expect("valid regex")
        .replace(url, "${scheme}${user}:••••@")
        .into_owned()
}

#[cfg(test)]
mod tests {
    use super::redact_url;

    #[test]
    fn removes_passwords_from_connection_display() {
        assert_eq!(
            redact_url("postgresql://alice:secret@db.example.com/app"),
            "postgresql://alice:••••@db.example.com/app"
        );
        assert_eq!(
            redact_url("mysql://alice@localhost/app"),
            "mysql://alice:••••@localhost/app"
        );
    }
}
