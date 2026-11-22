import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { emailType, getBatchFromEmail, unknownDegree } from "lib";
import * as client from "openid-client";
import { getConfig } from "../../config/authClient.js";
import { env } from "../../config/server.js";
import { User } from "../../entity/entities.js";
import { userRepository } from "../../repositories/index.js";
import timetableJSON from "../../timetable.json" with { type: "json" };
import {
  ZodFinishedUserSession,
  ZodUnfinishedUserSession,
} from "../../types/auth.js";
import { userDegreesSchema } from "../../types/user.js";
import {
  clearAuthCookies,
  clearPkceCookies,
  issueSession,
  readSession,
  setPkceCookies,
  toTitleCase,
} from "../../utils/authUtils.js";

// expired sessions, or ones signed with a rotated key, count as logged out
const hasValidSession = (req: Request) => {
  try {
    return readSession(req).ok;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) return false;
    throw error;
  }
};

// redirects to the logto sign in page
export async function manageAuthRedirect(req: Request, res: Response) {
  const logger = req.log;
  try {
    if (hasValidSession(req)) {
      return res.redirect(env.FRONTEND_URL);
    }
    if (req.cookies.session || req.cookies.fingerprint) {
      clearAuthCookies(res);
    }

    const config = await getConfig();
    // pkce verifier and state are generated per request, and stashed in
    // short-lived cookies so the callback can verify the token exchange
    const code_verifier = client.randomPKCECodeVerifier();
    const code_challenge =
      await client.calculatePKCECodeChallenge(code_verifier);
    const state = client.randomState();

    const parameters: Record<string, string> = {
      redirect_uri: `${env.BACKEND_URL}/auth/callback`,
      scope: "openid email profile",
      code_challenge,
      code_challenge_method: "S256",
      state,
    };

    const authRedirect = client.buildAuthorizationUrl(config, parameters);
    setPkceCookies(res, code_verifier, state);
    return res.redirect(authRedirect.href);
  } catch (err) {
    logger.error(err, "Authentication failure");
    return res.status(500).json({
      message: "authentication failure",
    });
  }
}

// starts a session after validating access_token
export async function authCallback(req: Request, res: Response) {
  try {
    if (req.cookies.session && req.cookies.fingerprint) {
      res.redirect(env.FRONTEND_URL);
    } else {
      const pkceVerifier = req.cookies.pkce_verifier;
      const pkceState = req.cookies.pkce_state;
      if (pkceVerifier === undefined || pkceState === undefined) {
        return res.status(401).redirect(`${env.BACKEND_URL}/auth/login`);
      }

      const config = await getConfig();
      const tokenSet = await client.authorizationCodeGrant(
        config,
        new URL(`${env.BACKEND_URL}${req.originalUrl}`),
        {
          pkceCodeVerifier: pkceVerifier,
          idTokenExpected: true,
          expectedState: pkceState,
        },
      );
      clearPkceCookies(res);

      const access_token = tokenSet.access_token;

      const userInfo = await client.fetchUserInfo(
        config,
        access_token,
        tokenSet.claims()?.sub || "",
      );

      const maxAge = env.SESSION_MAX_AGE_MS;

      // fall back to the id token's claims if userinfo doesn't return them
      const idTokenClaims = tokenSet.claims();
      const name =
        userInfo.name ??
        (typeof idTokenClaims?.name === "string"
          ? idTokenClaims.name
          : undefined);
      const email =
        userInfo.email ??
        (typeof idTokenClaims?.email === "string"
          ? idTokenClaims.email
          : undefined);

      if (name === undefined || email === undefined) {
        return res.status(500).json({
          message: "error while authenticating",
          error: "incomplete information returned by OAuth provider",
        });
      }
      return startSession(res, name, email, maxAge);
    }
  } catch {
    return res.status(401).redirect(`${env.BACKEND_URL}/auth/login`);
  }
}

async function startSession(
  res: Response,
  name: string,
  email: string,
  maxAge: number,
) {
  const existingUser = await userRepository
    .createQueryBuilder()
    .select()
    .where("email = :email", {
      email,
    })
    .getOne();

  if (existingUser) {
    issueSession(
      res,
      {
        name: existingUser.name,
        email: existingUser.email,
        id: existingUser.id,
      },
      maxAge,
    );
    return res.redirect(env.FRONTEND_URL);
  }

  const batch = getBatchFromEmail(email);
  if (batch === "0000") {
    // hd students and other non-f addresses have no batch or degree
    // defaults to ask for on getDegrees, so they skip it entirely and
    // get sentinel values instead
    await createUserAndSession(
      res,
      { name, email, degrees: [unknownDegree] },
      maxAge,
    );
    return res.redirect(env.FRONTEND_URL);
  }

  issueSession(res, { name, email, maxAge }, maxAge);
  res.redirect(`${env.FRONTEND_URL}/getDegrees?year=${yearOfStudy(batch)}`);
}

const yearOfStudy = (batch: string) =>
  timetableJSON.metadata.acadYear - Number.parseInt(batch, 10) + 1;

async function createUserAndSession(
  res: Response,
  user: Pick<User, "name" | "email" | "degrees">,
  maxAge: number,
) {
  const name = toTitleCase(user.name);
  const createdUser = await userRepository
    .createQueryBuilder()
    .insert()
    .into(User)
    .values({
      batch: Number.parseInt(getBatchFromEmail(user.email), 10),
      name,
      degrees: user.degrees,
      email: user.email,
      timetables: [],
    })
    .execute();
  issueSession(
    res,
    { name, email: user.email, id: createdUser.identifiers[0].id },
    maxAge,
  );
}

export const isLoginAsEnabled = (): boolean =>
  env.NODE_ENV !== "production" && env.LOGIN_AS;

export const authMethods = async (_req: Request, res: Response) => {
  if (!isLoginAsEnabled()) {
    return res.json({ loginAs: false, users: [] });
  }
  const rows = await userRepository.find({
    relations: { timetables: true },
    select: {
      id: true,
      email: true,
      name: true,
      batch: true,
      degrees: true,
      timetables: { id: true, archived: true },
    },
    order: { name: "ASC" },
  });
  const users = rows
    .map((user) => ({
      email: user.email,
      name: user.name,
      batch: user.batch,
      degrees: user.degrees,
      timetableCount: user.timetables.filter((t) => !t.archived).length,
    }))
    .sort(
      (a, b) =>
        b.timetableCount - a.timetableCount || a.name.localeCompare(b.name),
    );
  return res.json({ loginAs: true, users });
};

export async function loginAs(req: Request, res: Response) {
  const email = emailType.safeParse(req.query.email);
  if (!email.success) {
    return res.status(400).json({ message: "pass a valid ?email=" });
  }
  const name =
    typeof req.query.name === "string" && req.query.name.trim()
      ? req.query.name.trim()
      : "Dev User";
  return startSession(res, name, email.data, env.SESSION_MAX_AGE_MS);
}

export async function getDegrees(req: Request, res: Response) {
  const logger = req.log;

  try {
    const read = readSession(req);
    if (!read.ok) {
      return res.status(401).json({
        message: "cannot set degrees",
        error: read.error,
      });
    }

    const parsedSession = ZodUnfinishedUserSession.safeParse(read.payload);
    if (!parsedSession.success) {
      return res.status(401).json({
        message: "cannot set degrees",
        error: "user session malformed",
      });
    }
    const session = parsedSession.data;

    const degrees = userDegreesSchema.safeParse(req.body.degrees);
    if (!degrees.success) {
      return res.status(400).json({
        message: "cannot set degrees",
        error: "invalid set of degrees passed",
      });
    }

    const user = await userRepository.findOne({
      where: { email: session.email },
    });

    if (user) {
      return res.status(400).json({
        message: "user already exists",
      });
    }

    await createUserAndSession(
      res,
      { name: session.name, email: session.email, degrees: degrees.data },
      session.maxAge,
    );
    res.json({
      success: true,
    });
  } catch (error) {
    logger.error(error, "Failed to register");
    return res.status(500).json({
      success: false,
      message: "failed to register",
      error: JSON.stringify(error),
    });
  }
}

// clears the auth cookies and redirects to logto's end session endpoint,
// which ends the sso session and sends the user back to the login page
export async function logout(_req: Request, res: Response) {
  clearAuthCookies(res);
  if (isLoginAsEnabled()) {
    return res.redirect(`${env.FRONTEND_URL}/login`);
  }
  const endSessionUrl = new URL(`${env.LOGTO_ENDPOINT}/oidc/session/end`);
  endSessionUrl.searchParams.set("client_id", env.LOGTO_APP_ID);
  endSessionUrl.searchParams.set(
    "post_logout_redirect_uri",
    `${env.FRONTEND_URL}/login`,
  );
  return res.redirect(endSessionUrl.href);
}

// checks whether user is not logged in, logged in but hasn't finished selecting degrees, or properly logged in
export async function checkAuthStatus(req: Request, res: Response) {
  const logger = req.log;
  try {
    const read = readSession(req);
    if (!read.ok) {
      if (read.error === "user session expired") {
        return res.status(401).json({
          message: "user not logged in",
        });
      }
      return res.status(401).json({
        message: "user session malformed",
        error: "user session malformed",
      });
    }
    const sessionData = read.payload;

    const unfinishedSession = ZodUnfinishedUserSession.safeParse(sessionData);
    if (unfinishedSession.success) {
      const session = unfinishedSession.data;
      const user = await userRepository
        .createQueryBuilder()
        .select()
        .where("email = :email", {
          email: session.email,
        })
        .getOne();

      if (user) {
        clearAuthCookies(res);
        return res.status(401).json({
          message: "user not logged in",
        });
      }

      // 0000 users are created at signup, so only f-batch users get here
      return res.json({
        message: "user needs to get degrees",
        redirect: `/getDegrees?year=${yearOfStudy(getBatchFromEmail(session.email))}`,
      });
    }

    const finishedSession = ZodFinishedUserSession.safeParse(sessionData);
    if (finishedSession.success) {
      // if user doesn't exist but JWT is valid we should invalidate that token
      const userExists = await userRepository.exists({
        where: { id: finishedSession.data.id },
      });
      if (!userExists) {
        clearAuthCookies(res);
        return res.status(401).json({
          message: "user not logged in",
          error: "user session expired",
        });
      }
      return res.json({ message: "user is logged in", redirect: "/" });
    }

    return res.status(401).json({
      message: "cannot verify auth status",
      error: "user session malformed",
    });
  } catch (error) {
    // expired sessions, or ones signed with a different key
    if (error instanceof jwt.JsonWebTokenError) {
      clearAuthCookies(res);
      return res.status(401).json({
        message: "user not logged in",
        error: "invalid user session",
      });
    }
    logger.error(error, "Error while checking auth status");
    return res.status(500).json({
      message: "Internal Server Error",
      error: JSON.stringify(error),
    });
  }
}
