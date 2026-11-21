import { cache } from "react";
import { redirect } from "next/navigation";
import { api } from "./api-server";
import { ApiError } from "./api";
import type { ApiSuccess, User } from "./types";

export async function guard401<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/auth/login");
    throw error;
  }
}

export const requireUser = cache(async (cookie: string): Promise<User> =>
  (await guard401(api.get<ApiSuccess<User>>("/auth/me", { cookie }))).data,
);
