//! Build .drs files from parsed rule entries

use super::parser::{EntryType, RuleEntry};
use anyhow::Result;
use sha2::{Digest, Sha256};
use std::io::Write;
use std::path::Path;
use tracing::info;

pub fn build_from_entries<W: Write>(
    entries: &[RuleEntry],
    writer: &mut W,
    source_hash: [u8; 32],
) -> Result<(usize, usize)> {
    let mut domains: Vec<String> = Vec::new();
    let mut suffixes: Vec<String> = Vec::new();

    for entry in entries {
        match entry.rule_type {
            EntryType::Domain => domains.push(entry.domain.clone()),
            EntryType::DomainSuffix => suffixes.push(entry.domain.clone()),
        }
    }

    let dc = domains.len();
    let sc = suffixes.len();

    super::drs::DrsFile::write(writer, &domains, &suffixes, source_hash)?;

    Ok((dc, sc))
}

pub fn hash_inputs(paths: &[&Path]) -> Result<[u8; 32]> {
    let mut hasher = Sha256::new();
    for path in paths {
        let data = std::fs::read(path)?;
        hasher.update(&data);
    }
    Ok(hasher.finalize().into())
}

pub fn build_from_files(
    inputs: &[(String, super::super::cmd::build::InputFormat)],
    output_path: &Path,
) -> Result<()> {
    let mut all_entries: Vec<RuleEntry> = Vec::new();

    for (path_str, format) in inputs {
        let path = Path::new(path_str);
        let content = std::fs::read_to_string(path)
            .map_err(|e| anyhow::anyhow!("Failed to read {}: {}", path.display(), e))?;

        let entries = match format {
            super::super::cmd::build::InputFormat::Mihomo => {
                super::parser::mihomo::parse(&content)
                    .map_err(|e| anyhow::anyhow!("Failed to parse mihomo yaml {}: {}", path.display(), e))?
            }
            super::super::cmd::build::InputFormat::Adguard => {
                super::parser::adguard::parse(&content)
            }
        };

        info!("Parsed {} entries from {}", entries.len(), path.display());
        all_entries.extend(entries);
    }

    // Compute hash from all input files
    let input_paths: Vec<&Path> = inputs.iter().map(|(p, _)| Path::new(p.as_str())).collect();
    let source_hash = hash_inputs(&input_paths)?;

    let mut file = std::fs::File::create(output_path)?;
    let (dc, sc) = build_from_entries(&all_entries, &mut file, source_hash)?;

    info!(
        "Built {} ({} exact domains, {} suffix rules) → {}",
        output_path.display(),
        dc,
        sc,
        output_path.display()
    );

    Ok(())
}
