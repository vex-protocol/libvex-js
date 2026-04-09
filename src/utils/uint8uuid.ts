import { parse as uuidParse } from "uuid";
/**
 * @ignore
 */
export function uuidToUint8(uuid: string) {
    return new Uint8Array(uuidParse(uuid));
}
