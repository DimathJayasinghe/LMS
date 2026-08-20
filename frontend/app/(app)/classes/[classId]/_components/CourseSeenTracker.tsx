"use client";

import { useEffect } from "react";
import { api } from "@/lib/api";

export function CourseSeenTracker({ courseId }: { courseId: string }) {
  useEffect(() => {
    void api.post(`/enrollments/learning/${courseId}/seen`).catch(() => undefined);
  }, [courseId]);

  return null;
}
