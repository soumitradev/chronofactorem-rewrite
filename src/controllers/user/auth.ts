import { TokenSet } from "openid-client";
import { generators } from "openid-client";
import { Request, Response } from "express";
import { getClient } from "../../config/authClient";
import { userRepository } from "../../repositories/userRepository";
import { DegreeEnum } from "../../types/degrees";
import { Session, UserData } from "../../types/auth";
import { env } from "../../config/server";

// On any route, when checking if a user is logged in, check for the cookie
// in cookiestorage on the server, using -
// const session = req.cookies['session'];
// now, the session object can be used to see if the user is logged in or not

// on the frontend, for accessing routes, send requests with credentials:true

// openid code_verifier
const code_verifier = generators.codeVerifier();

// redirects to the redirect URL for signing in
export async function manageAuthRedirect(req: Request, res: Response) {
  try {
    if (req.cookies["session"]) {
      res.redirect(`${env.PROD_URL}/auth/callback`);
    } else {
      const client = await getClient();
      const codeChallenge = generators.codeChallenge(code_verifier);

      const authRedirect = client.authorizationUrl({
        scope: "openid email profile",
        codeChallenge,
        code_challenge_method: "S256",
      });

      res.redirect(authRedirect);
    }
  } catch (err: any) {
    res.status(500).json({
      message: "authentication failure",
    });
  }
}

// starts a session after validating access_token
export async function authCallback(req: Request, res: Response) {
  try {
    if (req.cookies["session"]) {
      res.json({
        authenticated: true,
        message: "user is logged in",
      });
    } else {
      // sets session cookie

      const client = await getClient();
      const params = client.callbackParams(req);

      // tokenSet contains the refresh_token and access_token codes
      const tokenSet = await client.callback(
        `${env.PROD_URL}/auth/callback`,
        params,
        { code_verifier }
      );

      // obtaining the access_token from tokenSet
      const accessToken = tokenSet.access_token;

      // obtaining userInfo from the access_token code
      const userInfo = await client.userinfo(accessToken as string | TokenSet);

      const userData: Session = {
        name: userInfo.name,
        email: userInfo.email,
      };

      // tokenSet.claims() returns validated information contained upon accessing the token
      const tokenExpiryTime = tokenSet.claims().exp;

      // defines maxAge to be the time when the session cookie expires
      const maxAge = tokenExpiryTime * 1000 - Date.now(); // converts into milliseconds

      // setting the cookie
      res.cookie("session", userData, { maxAge: maxAge, httpOnly: true });

      res.status(200).json({
        success: true,
        message: "user session has started",
      });
    }
  } catch (err: any) {
  
    // If user exists on database, redirect them to frontpage, if not
    // redirect them to a /profile route where they fill their degrees
    // on the frontend

    res.status(401).redirect(`${env.PROD_URL}/auth/login`);
  }
}

export async function getDegrees(req: Request, res: Response) {
  // this function is declared outside the try catch block
  // to make the capitalised name into title case

  function toTitleCase(str: string | undefined) {
    if (str === undefined) {
      return '';
    }
    return str.split(" ").map(s => s[0].toUpperCase() + s.substring(1).toLowerCase()).join(' ');
  }

  try {
    // for user to enter their degrees
    // the session cookie is parsed here, and then the info about
    // the user: name, email and degrees is stored on the database

    // gets userInfo as part of session
    const session: Session = req.cookies["session"];

    const degrees: DegreeEnum[] = req.body.degrees;

    const userData: UserData = {
      name: session.name,
      email: session.email,
      degrees: degrees,
    };

    // slices mail to obtain batch
    const batch = (userData.email?.match('^f\d{8}@hyderabad\.bits-pilani\.ac\.in$'))
      ? userData.email?.slice(3, 5)!
      : "-1"; // batch is set to -1 if it's a non-student email, like hpc@hyderabad.bits-hyderabad.ac.in

    // converts name to title case
    const name = toTitleCase(userData.name);

    // this can be better handled by first accessing the find user endpoint,
    // if user exists, then send a response and return. For now, this can just insert.
    // Errors are not handled here, as of yet.

    userRepository
      .createQueryBuilder()
      .insert()
      .values({
        batch: parseInt(batch),
        name: name,
        degrees: userData.degrees,
        email: userData.email,
        timetables: [],
      }).execute()
    
    // userRepository.insert({
    //   batch: parseInt(batch),
    //   name: name!,
    //   degrees: userData.degrees,
    //   email: userData.email,
    //   timetables: [],
    // });

    res.json({
      success: true,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "failed to register",
    });
  }
}

// this function deletes the session cookie to log out
export async function logout(req: Request, res: Response) {
  res.clearCookie("session");
  res.json({
    authenticated: false,
    message: "user logged out",
  });
}