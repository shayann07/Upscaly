use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModelMetadata {
    pub scale: u32,
    pub input_channels: u32,
    pub is_valid: bool,
    pub layer_count: usize,
    pub blob_count: usize,
}

pub fn parse_ncnn_param(path: &Path) -> Result<ModelMetadata, String> {
    let file = File::open(path)
        .map_err(|e| format!("Failed to open param file {}: {}", path.display(), e))?;
    let reader = BufReader::new(file);
    let mut lines = reader.lines();

    let header_line = match lines.next() {
        Some(Ok(line)) => line,
        _ => return Err("Param file is empty or corrupted".to_string()),
    };

    let (layer_count, blob_count) = read_header(&header_line)?;

    let mut calculated_scale: u32 = 1;
    let mut input_channels: u32 = 3;
    let mut parsed_layer_lines = 0;

    for line_res in lines {
        let line = match line_res {
            Ok(l) => l,
            Err(_) => break,
        };

        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        parsed_layer_lines += 1;
        parse_layer_line(trimmed, &mut input_channels, &mut calculated_scale);
    }

    if parsed_layer_lines == 0 {
        return Err("No layer operations found in NCNN param file".to_string());
    }

    let final_scale = if calculated_scale > 1 {
        calculated_scale
    } else {
        4
    };

    Ok(ModelMetadata {
        scale: final_scale,
        input_channels,
        is_valid: true,
        layer_count: if layer_count > 0 {
            layer_count
        } else {
            parsed_layer_lines
        },
        blob_count,
    })
}

fn read_header(header_line: &str) -> Result<(usize, usize), String> {
    let header_tokens: Vec<&str> = header_line.split_whitespace().collect();
    if header_tokens.is_empty() {
        return Err("Invalid NCNN param magic header".to_string());
    }

    let layer_count = header_tokens
        .get(1)
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(0);
    let blob_count = header_tokens
        .get(2)
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(0);

    Ok((layer_count, blob_count))
}

fn parse_layer_line(line: &str, input_channels: &mut u32, calculated_scale: &mut u32) {
    let tokens: Vec<&str> = line.split_whitespace().collect();
    if tokens.is_empty() {
        return;
    }

    let layer_type = tokens[0];
    let params: Vec<(u32, String)> = tokens
        .iter()
        .skip(1)
        .filter_map(|p| parse_key_value(p))
        .collect();

    match layer_type {
        "Input" => {
            for (k, v) in &params {
                if *k == 0 || *k == 2 {
                    if let Ok(chans) = v.parse::<u32>() {
                        if (1..=16).contains(&chans) {
                            *input_channels = chans;
                        }
                    }
                }
            }
        }
        "Interp" | "Resample" => {
            // Keys 1 and 2 are width/height scale (same value for isotropic upscale).
            // Only apply the factor once per layer, not per-parameter.
            let mut layer_scale: u32 = 0;
            for (k, v) in &params {
                if (1..=2).contains(k) {
                    if let Ok(scale_val) = v.parse::<f32>() {
                        let scale_int = scale_val as u32;
                        if (2..=8).contains(&scale_int) && scale_int > layer_scale {
                            layer_scale = scale_int;
                        }
                    }
                }
            }
            if layer_scale > 0 {
                *calculated_scale *= layer_scale;
            }
        }
        "Deconvolution" | "DeconvolutionDepthWise" | "Deconv" => {
            for (k, v) in &params {
                if *k == 1 || *k == 2 {
                    if let Ok(stride) = v.parse::<u32>() {
                        if (2..=8).contains(&stride) {
                            *calculated_scale *= stride;
                        }
                    }
                }
            }
        }
        "PixelShuffle" | "Subpixel" => {
            for (k, v) in &params {
                if *k == 0 {
                    if let Ok(upscale) = v.parse::<u32>() {
                        if (2..=8).contains(&upscale) {
                            *calculated_scale *= upscale;
                        }
                    }
                }
            }
        }
        _ => {}
    }
}

pub fn parse_key_value(token: &str) -> Option<(u32, String)> {
    let parts: Vec<&str> = token.split('=').collect();
    if parts.len() == 2 {
        if let Ok(key) = parts[0].parse::<u32>() {
            return Some((key, parts[1].to_string()));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_key_value() {
        assert_eq!(parse_key_value("0=2"), Some((0, "2".to_string())));
        assert_eq!(parse_key_value("1=3.5"), Some((1, "3.5".to_string())));
        assert_eq!(parse_key_value("invalid"), None);
    }

    #[test]
    fn test_read_header() {
        let (layers, blobs) = read_header("7767 12 15").unwrap();
        assert_eq!(layers, 12);
        assert_eq!(blobs, 15);

        let (layers_default, blobs_default) = read_header("7767").unwrap();
        assert_eq!(layers_default, 0);
        assert_eq!(blobs_default, 0);

        assert!(read_header("").is_err());
    }

    #[test]
    fn test_parse_layer_line() {
        let mut chans = 3;
        let mut scale = 1;

        parse_layer_line("Input in 0 1 0 0=4", &mut chans, &mut scale);
        assert_eq!(chans, 4);

        // Interp layer with width=2, height=2 should count as a single 2x upscale per layer
        parse_layer_line("Interp interp 1 1 out 0=1 1=2 2=2", &mut chans, &mut scale);
        assert_eq!(scale, 2);

        // A second Interp layer multiplies further: 2 * 2 = 4
        parse_layer_line("Interp interp2 1 1 out2 0=1 1=2 2=2", &mut chans, &mut scale);
        assert_eq!(scale, 4);
    }
}
