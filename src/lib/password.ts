import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const KEY_LEN = 64;

export function hashPassword(password: string): string {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(password, salt, KEY_LEN).toString("hex");
    return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
    const [salt, hashHex] = stored.split(":");
    if (!salt || !hashHex) return false;
    const hash = Buffer.from(hashHex, "hex");
    const input = scryptSync(password, salt, KEY_LEN);
    if (hash.length !== input.length) return false;
    return timingSafeEqual(hash, input);
}

