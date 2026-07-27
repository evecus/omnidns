use anyhow::Result;
use clap::{Parser, ValueEnum};
use std::path::PathBuf;

#[derive(Debug, Clone, ValueEnum)]
pub enum InputFormat {
    Mihomo,
    Adguard,
}

#[derive(Parser, Debug)]
pub struct BuildArgs {
    /// Input files (can be specified multiple times)
    #[arg(short, long = "input", required = true)]
    pub inputs: Vec<String>,

    /// Format of the input files
    #[arg(short, long, value_enum)]
    pub format: InputFormat,

    /// Output .drs file path
    #[arg(short, long)]
    pub output: PathBuf,
}

pub fn build(args: BuildArgs) -> Result<()> {
    let inputs: Vec<(String, InputFormat)> = args
        .inputs
        .into_iter()
        .map(|p| {
            let fmt = match args.format {
                InputFormat::Mihomo => InputFormat::Mihomo,
                InputFormat::Adguard => InputFormat::Adguard,
            };
            (p, fmt)
        })
        .collect();

    crate::ruleset::builder::build_from_files(&inputs, &args.output)
}
