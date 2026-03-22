/// Rearrange an MP4 so the moov atom comes before mdat (faststart).
/// If already faststart or not a valid MP4, returns the original bytes unchanged.
pub fn faststart(data: Vec<u8>) -> Vec<u8> {
    let len = data.len();
    if len < 8 {
        return data;
    }

    // Find moov and mdat positions
    let mut moov_pos = None;
    let mut moov_size = 0usize;
    let mut mdat_pos = None;
    let mut pos = 0usize;

    while pos + 8 <= len {
        let size = u32::from_be_bytes([data[pos], data[pos + 1], data[pos + 2], data[pos + 3]]) as usize;
        let atom_type = &data[pos + 4..pos + 8];

        if size < 8 || pos + size > len {
            break;
        }

        if atom_type == b"moov" {
            moov_pos = Some(pos);
            moov_size = size;
        } else if atom_type == b"mdat" {
            mdat_pos = Some(pos);
        }

        pos += size;
    }

    let moov_start = match moov_pos {
        Some(p) => p,
        None => return data, // no moov found
    };
    let mdat_start = match mdat_pos {
        Some(p) => p,
        None => return data, // no mdat found
    };

    // Already faststart (moov before mdat)
    if moov_start < mdat_start {
        return data;
    }

    eprintln!("[faststart] Rearranging MP4: moov@{} size={}, mdat@{}", moov_start, moov_size, mdat_start);

    let moov_data = &data[moov_start..moov_start + moov_size];

    // We need to adjust chunk offsets in moov since mdat moves forward by moov_size
    // moov is being inserted before mdat, so all chunk offsets pointing into mdat need
    // to increase by moov_size (moov is inserted, pushing mdat forward)
    let mut moov_buf = moov_data.to_vec();
    let offset_delta = moov_size as i64;
    adjust_offsets(&mut moov_buf, offset_delta);

    // Build output: [everything before mdat] [moov] [mdat..end excluding old moov]
    let mut out = Vec::with_capacity(len);
    out.extend_from_slice(&data[..mdat_start]);
    out.extend_from_slice(&moov_buf);
    out.extend_from_slice(&data[mdat_start..moov_start]);
    if moov_start + moov_size < len {
        out.extend_from_slice(&data[moov_start + moov_size..]);
    }

    eprintln!("[faststart] Done: {} -> {} bytes", len, out.len());
    out
}

fn adjust_offsets(moov: &mut [u8], delta: i64) {
    let len = moov.len();
    let mut pos = 8; // skip moov header

    while pos + 8 <= len {
        let size = u32::from_be_bytes([moov[pos], moov[pos + 1], moov[pos + 2], moov[pos + 3]]) as usize;
        let atom_type = &moov[pos + 4..pos + 8];

        if size < 8 || pos + size > len {
            break;
        }

        if atom_type == b"trak" || atom_type == b"mdia" || atom_type == b"minf" || atom_type == b"stbl" {
            // Recurse into container atoms
            adjust_offsets(&mut moov[pos..pos + size], delta);
        } else if atom_type == b"stco" && size >= 16 {
            // 32-bit chunk offset table
            let entry_count = u32::from_be_bytes([moov[pos + 12], moov[pos + 13], moov[pos + 14], moov[pos + 15]]) as usize;
            let mut i = 0;
            while i < entry_count && pos + 16 + (i + 1) * 4 <= len {
                let off = pos + 16 + i * 4;
                let val = u32::from_be_bytes([moov[off], moov[off + 1], moov[off + 2], moov[off + 3]]);
                let new_val = (val as i64 + delta) as u32;
                let bytes = new_val.to_be_bytes();
                moov[off..off + 4].copy_from_slice(&bytes);
                i += 1;
            }
        } else if atom_type == b"co64" && size >= 16 {
            // 64-bit chunk offset table
            let entry_count = u32::from_be_bytes([moov[pos + 12], moov[pos + 13], moov[pos + 14], moov[pos + 15]]) as usize;
            let mut i = 0;
            while i < entry_count && pos + 16 + (i + 1) * 8 <= len {
                let off = pos + 16 + i * 8;
                let val = u64::from_be_bytes([moov[off], moov[off + 1], moov[off + 2], moov[off + 3], moov[off + 4], moov[off + 5], moov[off + 6], moov[off + 7]]);
                let new_val = (val as i64 + delta) as u64;
                let bytes = new_val.to_be_bytes();
                moov[off..off + 8].copy_from_slice(&bytes);
                i += 1;
            }
        }

        pos += size;
    }
}
