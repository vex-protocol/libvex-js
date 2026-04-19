/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

/**
 * Inline test fixtures — no fs needed, works on all platforms.
 */

// Minimal valid 1x1 transparent PNG (67 bytes)
const TINY_PNG_B64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRU5ErkJggg==";

function base64ToUint8Array(b64: string): Uint8Array {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/** Valid 1x1 PNG — passes MIME type checks for avatar/emoji endpoints. */
export const testImage = base64ToUint8Array(TINY_PNG_B64);

/** Arbitrary binary data for file upload tests. */
export const testFile = new Uint8Array(1000).fill(42);
