import { cache } from "react";
import { redirect } from "next/navigation";
import { api } from "./api-server";
import { ApiError } from "./api";
import type { ApiSuccess, User } from "./types";

export const requireUser = cache(async (cookie: string): Promise<User> => {
  try {
    return (await api.get<ApiSuccess<User>>("/auth/me", { cookie })).data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/auth/login");
    throw error;
  }
});
