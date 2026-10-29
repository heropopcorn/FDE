"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingText = "处理中…",
  className = "btn btn-primary",
  ...props
}: React.ComponentProps<"button"> & { pendingText?: string }) {
  const { pending, data } = useFormStatus();
  const submitted = data?.get(String(props.name ?? ""));
  const clicked = pending && (props.value == null || submitted === props.value);
  return (
    <button type="submit" {...props} className={className} disabled={pending || props.disabled}>
      {clicked ? pendingText : children}
    </button>
  );
}
