"use client";

import { Select as PanelSelect } from "panel-frame-ui";

interface Option {
  value: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export default function Select({
  label,
  value,
  options,
  onValueChange,
  disabled = false,
  stretch = false,
  className = "",
}: {
  label: string;
  value: string;
  options: Option[];
  onValueChange: (value: string) => void;
  disabled?: boolean;
  stretch?: boolean;
  className?: string;
}) {
  return (
    <PanelSelect
      aria-label={label}
      className={`${stretch ? "pf-select-stretch" : ""} ${className}`.trim()}
      disabled={disabled}
      onValueChange={onValueChange}
      options={options}
      value={value}
    />
  );
}
