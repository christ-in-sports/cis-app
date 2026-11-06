/**
 * Shown inside the Registration layout while one of its pages loads, so the
 * section tabs stay put. It reuses the app shell's loading screen: no heading,
 * because this one fallback covers every screen in the group (CISers, Servants,
 * Roster import, Roles, Register a kid) and any single title would be wrong for
 * the others until the page's own `BoardHeader` arrives.
 */
export { default } from '../loading';
