/**
 * @param {(s: string, cb: () => void) => void} describe 
 * @param {(s: string, cb: () => void) => void} it 
 * @param {(o: any) => { toBe: (o) => boolean}} expect 
 * @param {{parse: (s: string) => void}} api 
 */
function tests(describe, it, expect, api) {
    const parse = api.parse;

}