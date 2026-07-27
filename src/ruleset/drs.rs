//! .drs (DNS Ruleset) binary format
//!
//! Layout:
//!   [4]  magic: b"DRS\0"
//!   [1]  version: u8 = 1
//!   [1]  flags: u8   (bit0 = has_suffix_fst, bit1 = has_domain_fst)
//!   [8]  build_time: u64 (unix timestamp)
//!   [32] source_hash: sha256
//!   [4]  domain_fst_len: u32
//!   [4]  suffix_fst_len: u32
//!   [N]  domain_fst_bytes (exact domain matches)
//!   [M]  suffix_fst_bytes (suffix matches, keys are reversed labels)
//!
//! Domain encoding in FST:
//!   "google.com" → stored as-is in domain_fst
//!   "google.com" in suffix_fst → stored as "com.google" (reversed labels)
//!   so that prefix search finds all subdomains

use anyhow::{bail, Context, Result};
use fst::{Map, MapBuilder};
use std::io::Write;
use std::path::Path;

pub const MAGIC: &[u8; 4] = b"DRS\0";
pub const VERSION: u8 = 1;

pub const FLAG_HAS_DOMAIN: u8 = 0b01;
pub const FLAG_HAS_SUFFIX: u8 = 0b10;

/// Value encoding in FST:
///   0 = DOMAIN exact
///   1 = DOMAIN-SUFFIX
#[derive(Debug, Clone, PartialEq)]
#[allow(dead_code)]
pub enum RuleType {
    Domain,
    DomainSuffix,
}

#[derive(Debug, Clone, PartialEq)]
pub enum MatchResult {
    Domain,
    DomainSuffix,
}

pub struct DrsFile {
    /// FST for exact domain matches
    domain_fst: Option<Map<Vec<u8>>>,
    /// FST for suffix matches (keys = reversed labels)
    suffix_fst: Option<Map<Vec<u8>>>,
    pub build_time: u64,
    pub source_hash: [u8; 32],
    pub domain_count: u64,
    pub suffix_count: u64,
}

impl DrsFile {
    /// Load a .drs file from disk
    pub fn load(path: &Path) -> Result<Self> {
        let data = std::fs::read(path)
            .with_context(|| format!("Failed to read {}", path.display()))?;
        Self::from_bytes(&data)
    }

    pub fn from_bytes(data: &[u8]) -> Result<Self> {
        if data.len() < 54 {
            bail!("DRS file too short");
        }
        if &data[0..4] != MAGIC {
            bail!("Invalid DRS magic bytes");
        }
        if data[4] != VERSION {
            bail!("Unsupported DRS version: {}", data[4]);
        }
        let flags = data[5];
        let build_time = u64::from_le_bytes(data[6..14].try_into().unwrap());
        let mut source_hash = [0u8; 32];
        source_hash.copy_from_slice(&data[14..46]);
        let domain_fst_len = u32::from_le_bytes(data[46..50].try_into().unwrap()) as usize;
        let suffix_fst_len = u32::from_le_bytes(data[50..54].try_into().unwrap()) as usize;

        let mut offset = 54;
        let domain_fst = if flags & FLAG_HAS_DOMAIN != 0 && domain_fst_len > 0 {
            let bytes = data[offset..offset + domain_fst_len].to_vec();
            offset += domain_fst_len;
            let m = Map::new(bytes).context("Invalid domain FST data")?;
            Some(m)
        } else {
            offset += domain_fst_len;
            None
        };

        let suffix_fst = if flags & FLAG_HAS_SUFFIX != 0 && suffix_fst_len > 0 {
            let bytes = data[offset..offset + suffix_fst_len].to_vec();
            let m = Map::new(bytes).context("Invalid suffix FST data")?;
            Some(m)
        } else {
            None
        };

        let domain_count = domain_fst.as_ref().map(|f| f.len() as u64).unwrap_or(0);
        let suffix_count = suffix_fst.as_ref().map(|f| f.len() as u64).unwrap_or(0);

        Ok(Self {
            domain_fst,
            suffix_fst,
            build_time,
            source_hash,
            domain_count,
            suffix_count,
        })
    }

    /// Check if a domain matches this ruleset
    pub fn matches(&self, domain: &str) -> Option<MatchResult> {
        let domain = domain.trim_end_matches('.').to_lowercase();

        // 1. Exact domain match
        if let Some(ref fst) = self.domain_fst {
            if fst.contains_key(&domain) {
                return Some(MatchResult::Domain);
            }
        }

        // 2. Suffix match: check if domain itself or any parent label matches
        if let Some(ref fst) = self.suffix_fst {
            // Check the domain itself as a suffix rule (e.g. rule "+.google.com" matches "google.com")
            let reversed = reverse_labels(&domain);
            if fst.contains_key(&reversed) {
                return Some(MatchResult::DomainSuffix);
            }

            // Check each parent domain
            let mut d = domain.as_str();
            while let Some(pos) = d.find('.') {
                d = &d[pos + 1..];
                let rev = reverse_labels(d);
                if fst.contains_key(&rev) {
                    return Some(MatchResult::DomainSuffix);
                }
            }
        }

        None
    }

    /// Write a .drs file from sorted domain and suffix lists
    pub fn write<W: Write>(
        writer: &mut W,
        domains: &[String],
        suffixes: &[String],
        source_hash: [u8; 32],
    ) -> Result<()> {
        // Build domain FST
        let domain_bytes = if !domains.is_empty() {
            let mut sorted = domains.to_vec();
            sorted.sort();
            sorted.dedup();
            let mut builder = MapBuilder::memory();
            for d in &sorted {
                builder.insert(d.as_bytes(), 0).with_context(|| {
                    format!("FST insert failed for domain: {}", d)
                })?;
            }
            builder.into_inner().context("Failed to build domain FST")?
        } else {
            vec![]
        };

        // Build suffix FST (reversed labels)
        let suffix_bytes = if !suffixes.is_empty() {
            let mut sorted: Vec<String> = suffixes
                .iter()
                .map(|s| reverse_labels(s))
                .collect();
            sorted.sort();
            sorted.dedup();
            let mut builder = MapBuilder::memory();
            for s in &sorted {
                builder.insert(s.as_bytes(), 1).with_context(|| {
                    format!("FST insert failed for suffix: {}", s)
                })?;
            }
            builder.into_inner().context("Failed to build suffix FST")?
        } else {
            vec![]
        };

        let mut flags = 0u8;
        if !domain_bytes.is_empty() { flags |= FLAG_HAS_DOMAIN; }
        if !suffix_bytes.is_empty() { flags |= FLAG_HAS_SUFFIX; }

        let build_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        // Header
        writer.write_all(MAGIC)?;
        writer.write_all(&[VERSION, flags])?;
        writer.write_all(&build_time.to_le_bytes())?;
        writer.write_all(&source_hash)?;
        writer.write_all(&(domain_bytes.len() as u32).to_le_bytes())?;
        writer.write_all(&(suffix_bytes.len() as u32).to_le_bytes())?;
        writer.write_all(&domain_bytes)?;
        writer.write_all(&suffix_bytes)?;

        Ok(())
    }
}

/// Reverse domain labels: "sub.google.com" → "com.google.sub"
pub fn reverse_labels(domain: &str) -> String {
    let labels: Vec<&str> = domain.split('.').collect();
    labels.into_iter().rev().collect::<Vec<_>>().join(".")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_drs(domains: &[&str], suffixes: &[&str]) -> Vec<u8> {
        let d: Vec<String> = domains.iter().map(|s| s.to_string()).collect();
        let s: Vec<String> = suffixes.iter().map(|s| s.to_string()).collect();
        let mut buf = Vec::new();
        DrsFile::write(&mut buf, &d, &s, [0u8; 32]).unwrap();
        buf
    }

    #[test]
    fn test_exact_match() {
        let buf = make_drs(&["google.com", "example.com"], &[]);
        let drs = DrsFile::from_bytes(&buf).unwrap();
        assert_eq!(drs.matches("google.com"), Some(MatchResult::Domain));
        assert_eq!(drs.matches("example.com"), Some(MatchResult::Domain));
        assert_eq!(drs.matches("sub.google.com"), None);
        assert_eq!(drs.matches("other.com"), None);
    }

    #[test]
    fn test_suffix_match() {
        let buf = make_drs(&[], &["google.com", "youtube.com"]);
        let drs = DrsFile::from_bytes(&buf).unwrap();
        // The domain itself
        assert_eq!(drs.matches("google.com"), Some(MatchResult::DomainSuffix));
        // Subdomains
        assert_eq!(drs.matches("sub.google.com"), Some(MatchResult::DomainSuffix));
        assert_eq!(drs.matches("a.b.youtube.com"), Some(MatchResult::DomainSuffix));
        // Non-matching
        assert_eq!(drs.matches("notgoogle.com"), None);
        assert_eq!(drs.matches("other.org"), None);
    }

    #[test]
    fn test_mixed() {
        let buf = make_drs(&["exact.com"], &["suffix.com"]);
        let drs = DrsFile::from_bytes(&buf).unwrap();
        assert_eq!(drs.matches("exact.com"), Some(MatchResult::Domain));
        assert_eq!(drs.matches("sub.exact.com"), None);
        assert_eq!(drs.matches("suffix.com"), Some(MatchResult::DomainSuffix));
        assert_eq!(drs.matches("sub.suffix.com"), Some(MatchResult::DomainSuffix));
    }
}
