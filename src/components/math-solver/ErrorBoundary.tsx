"use client";

import React from "react";

type Props = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

type State = { hasError: boolean };

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(_error: any): State {
    return { hasError: true };
  }

  componentDidCatch(error: any, info: any) {
    try { console.error("[MathSolver ErrorBoundary]", error, info); } catch {}
  }

  reset = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="text-sm text-red-500">Terjadi kesalahan saat menampilkan output.</div>
        )
      );
    }
    return this.props.children;
  }
}
