'use client'

import { ToastProvider } from "./toast"

export function Toaster({ children }: { children?: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>
}