"use client";
import Link from "next/link";
import type { ComponentProps } from "react";
import { useApp } from "./provider";
export default function SmartLink(props: ComponentProps<typeof Link>) {
  const { online } = useApp();
  if (!online && typeof props.href === "string") {
    const { href, children, className, onClick, ...rest } = props;
    return (
      <a
        href={href}
        className={className}
        onClick={onClick}
        aria-current={rest["aria-current"]}
        aria-label={rest["aria-label"]}
      >
        {children}
      </a>
    );
  }
  return <Link {...props} />;
}
