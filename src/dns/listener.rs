//! UDP and TCP DNS listeners

use crate::dns::router::Router;
use anyhow::Result;
use hickory_proto::op::Message;
use hickory_proto::serialize::binary::{BinDecodable, BinEncodable};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::{TcpListener, UdpSocket};
use tracing::{debug, error, warn};

pub async fn serve(addr: SocketAddr, router: Arc<Router>) -> Result<()> {
    let udp_router = router.clone();
    let tcp_router = router.clone();

    let udp_handle = tokio::spawn(async move {
        if let Err(e) = serve_udp(addr, udp_router).await {
            error!("UDP listener error: {}", e);
        }
    });

    let tcp_handle = tokio::spawn(async move {
        if let Err(e) = serve_tcp(addr, tcp_router).await {
            error!("TCP listener error: {}", e);
        }
    });

    tracing::info!("DNS server listening on {}", addr);

    tokio::select! {
        _ = udp_handle => {}
        _ = tcp_handle => {}
    }

    Ok(())
}

async fn serve_udp(addr: SocketAddr, router: Arc<Router>) -> Result<()> {
    let socket = Arc::new(UdpSocket::bind(addr).await?);
    tracing::info!("UDP listener on {}", addr);

    loop {
        let mut buf = vec![0u8; 4096];
        let (n, peer) = socket.recv_from(&mut buf).await?;
        buf.truncate(n);

        let socket = socket.clone();
        let router = router.clone();

        tokio::spawn(async move {
            match handle_request(&buf, &router).await {
                Ok(response_bytes) => {
                    if let Err(e) = socket.send_to(&response_bytes, peer).await {
                        warn!("Failed to send UDP response to {}: {}", peer, e);
                    }
                }
                Err(e) => {
                    debug!("Failed to handle UDP request from {}: {}", peer, e);
                }
            }
        });
    }
}

async fn serve_tcp(addr: SocketAddr, router: Arc<Router>) -> Result<()> {
    let listener = TcpListener::bind(addr).await?;
    tracing::info!("TCP listener on {}", addr);

    loop {
        let (stream, peer) = listener.accept().await?;
        let router = router.clone();

        tokio::spawn(async move {
            if let Err(e) = handle_tcp_conn(stream, peer, router).await {
                debug!("TCP connection error from {}: {}", peer, e);
            }
        });
    }
}

async fn handle_tcp_conn(
    mut stream: tokio::net::TcpStream,
    peer: SocketAddr,
    router: Arc<Router>,
) -> Result<()> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    loop {
        // DNS over TCP: 2-byte length prefix
        let len = match stream.read_u16().await {
            Ok(l) => l as usize,
            Err(_) => break, // client disconnected
        };

        if len == 0 || len > 65535 {
            break;
        }

        let mut buf = vec![0u8; len];
        stream.read_exact(&mut buf).await?;

        match handle_request(&buf, &router).await {
            Ok(resp) => {
                let resp_len = resp.len() as u16;
                stream.write_all(&resp_len.to_be_bytes()).await?;
                stream.write_all(&resp).await?;
            }
            Err(e) => {
                debug!("Failed to handle TCP request from {}: {}", peer, e);
                break;
            }
        }
    }
    Ok(())
}

async fn handle_request(buf: &[u8], router: &Router) -> Result<Vec<u8>> {
    let request = Message::from_bytes(buf)?;
    let response = router.resolve(&request).await?;
    let bytes = response.to_bytes()?;
    Ok(bytes)
}
