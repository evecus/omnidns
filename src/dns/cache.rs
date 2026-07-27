//! LRU DNS response cache with TTL awareness

use hickory_proto::op::Message;
use lru::LruCache;
use std::num::NonZeroUsize;
use std::sync::Mutex;
use std::time::Instant;

#[derive(Clone)]
struct CacheEntry {
    message: Message,
    inserted_at: Instant,
    ttl: u32,
}

impl CacheEntry {
    fn remaining_ttl(&self) -> Option<u32> {
        let elapsed = self.inserted_at.elapsed().as_secs() as u32;
        if elapsed >= self.ttl {
            None
        } else {
            Some(self.ttl - elapsed)
        }
    }
}

pub struct DnsCache {
    inner: Mutex<LruCache<String, CacheEntry>>,
    min_ttl: u32,
    max_ttl: u32,
}

impl DnsCache {
    pub fn new(size: usize, min_ttl: u32, max_ttl: u32) -> Self {
        let cap = NonZeroUsize::new(size.max(1)).unwrap();
        Self {
            inner: Mutex::new(LruCache::new(cap)),
            min_ttl,
            max_ttl,
        }
    }

    fn cache_key(name: &str, qtype: u16) -> String {
        format!("{}:{}", name.to_lowercase(), qtype)
    }

    pub fn get(&self, name: &str, qtype: u16) -> Option<Message> {
        let key = Self::cache_key(name, qtype);
        let mut inner = self.inner.lock().unwrap();
        if let Some(entry) = inner.get(&key) {
            if let Some(remaining) = entry.remaining_ttl() {
                let mut msg = entry.message.clone();
                // Update TTLs in the cloned message - do answers and additionals separately
                // to avoid simultaneous mutable borrows
                for record in msg.answers_mut().iter_mut() {
                    record.set_ttl(remaining);
                }
                for record in msg.additionals_mut().iter_mut() {
                    record.set_ttl(remaining);
                }
                return Some(msg);
            } else {
                // Expired; remove
                inner.pop(&key);
            }
        }
        None
    }

    pub fn insert(&self, name: &str, qtype: u16, message: &Message) {
        // Extract minimum TTL from all records
        let min_record_ttl = message
            .answers()
            .iter()
            .chain(message.additionals().iter())
            .map(|r| r.ttl())
            .min()
            .unwrap_or(self.min_ttl);

        let ttl = min_record_ttl
            .max(self.min_ttl)
            .min(self.max_ttl);

        if ttl == 0 {
            return;
        }

        let key = Self::cache_key(name, qtype);
        let entry = CacheEntry {
            message: message.clone(),
            inserted_at: Instant::now(),
            ttl,
        };
        self.inner.lock().unwrap().put(key, entry);
    }
}
