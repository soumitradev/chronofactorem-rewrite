import { createHash } from "node:crypto";
import type { CookieOptions, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/server.js";

const baseCookieOptions: CookieOptions = {
  domain: new URL(env.FRONTEND_URL).hostname,
  secure: true,
  sameSite: "lax",
};

export const clearAuthCookies = (res: Response) => {
  res.clearCookie("fingerprint", { ...baseCookieOptions, httpOnly: true });
  res.clearCookie("session", { ...baseCookieOptions, httpOnly: false });
};

export const setAuthCookies = (
  res: Response,
  token: string,
  fingerprint: string,
  maxAge: number,
) => {
  res.cookie("session", token, {
    ...baseCookieOptions,
    maxAge,
    httpOnly: false,
  });
  res.cookie("fingerprint", fingerprint, {
    ...baseCookieOptions,
    maxAge,
    httpOnly: true,
  });
};

export const signJWT = (data: object, maxAge: number) => {
  return jwt.sign(data, Buffer.from(env.JWT_PRIVATE_KEY, "base64"), {
    algorithm: "RS256",
    // maxAge is in milliseconds, but jsonwebtoken reads expiresIn as seconds
    expiresIn: Math.floor(maxAge / 1000),
  });
};

export const verifyJWT = (token: string) => {
  return jwt.verify(token, Buffer.from(env.JWT_PUBLIC_KEY, "base64"), {
    algorithms: ["RS256"],
  });
};

export const hashFingerprint = (fingerprintCookie: string) =>
  createHash("sha256").update(fingerprintCookie).digest("base64url");

export const toTitleCase = (str: string | undefined) => {
  if (str === undefined) {
    return "";
  }
  return str
    .split(" ")
    .map((s) => s[0].toUpperCase() + s.substring(1).toLowerCase())
    .join(" ");
};

const PKCE_COOKIE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

// stores the per-request pkce verifier and state so the auth callback can
// verify the token exchange belongs to this login attempt
export const setPkceCookies = (
  res: Response,
  verifier: string,
  state: string,
) => {
  const options = {
    ...baseCookieOptions,
    maxAge: PKCE_COOKIE_MAX_AGE_MS,
    httpOnly: true,
  };
  res.cookie("pkce_verifier", verifier, options);
  res.cookie("pkce_state", state, options);
};

export const clearPkceCookies = (res: Response) => {
  res.clearCookie("pkce_verifier", { ...baseCookieOptions, httpOnly: true });
  res.clearCookie("pkce_state", { ...baseCookieOptions, httpOnly: true });
};
