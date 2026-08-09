use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

#[derive(Debug, Clone, PartialEq)]
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

    // Line 1: Magic header e.g., "7767 11 11" or "7767"
    let header_line = match lines.next() {
        Some(Ok(line)) => line,
        _ => return Err("Param file is empty or corrupted".to_string()),
    };

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

    let mut calculated_scale: u32 = 1;
    let mut input_channels: u32 = 3; // Default RGB
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
        let tokens: Vec<&str> = trimmed.split_whitespace().collect();
        if tokens.is_empty() {
            continue;
        }

        let layer_type = tokens[0];

        // 1. Input Layer: parse channel count (0=c)
        if layer_type == "Input" {
            for param in tokens.iter().skip(1) {
                if let Some((k, v)) = parse_key_value(param) {
                    if k == 0 || k == 2 {
                        if let Ok(chans) = v.parse::<u32>() {
                            if chans > 0 && chans <= 16 {
                                input_channels = chans;
                            }
                        }
                    }
                }
            }
        }

        // 2. Interp / Resample Layer: e.g. 0=2 (height scale), 1=2 (width scale)
        if layer_type == "Interp" {
            for param in tokens.iter().skip(1) {
                if let Some((k, v)) = parse_key_value(param) {
                    if k == 0 || k == 1 || k == 2 || k == 3 {
                        if let Ok(scale_val) = v.parse::<f32>() {
                            let scale_int = scale_val.round() as u32;
                            if scale_int >= 2 && scale_int <= 8 {
                                calculated_scale *= scale_int;
                            }
                        }
                    }
                }
            }
        }

        // 3. Deconvolution / Deconv: stride parameters (1=2, 2=2)
        if layer_type == "Deconvolution"
            || layer_type == "DeconvolutionDepthWise"
            || layer_type == "Deconv"
        {
            for param in tokens.iter().skip(1) {
                if let Some((k, v)) = parse_key_value(param) {
                    if k == 1 || k == 2 {
                        if let Ok(stride) = v.parse::<u32>() {
                            if stride >= 2 && stride <= 8 {
                                calculated_scale *= stride;
                            }
                        }
                    }
                }
            }
        }

        // 4. PixelShuffle / Subpixel: upscale factor (0=2, 0=3, 0=4)
        if layer_type == "PixelShuffle" || layer_type == "Subpixel" {
            for param in tokens.iter().skip(1) {
                if let Some((k, v)) = parse_key_value(param) {
                    if k == 0 {
                        if let Ok(upscale) = v.parse::<u32>() {
                            if upscale >= 2 && upscale <= 8 {
                                calculated_scale *= upscale;
                            }
                        }
                    }
                }
            }
        }
    }

    if parsed_layer_lines == 0 {
        return Err("No layer operations found in NCNN param file".to_string());
    }

    // Fallback scale if 1
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

fn parse_key_value(token: &str) -> Option<(u32, String)> {
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
}
