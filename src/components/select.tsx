"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import styles from "./select.module.css";

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
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 280,
  });
  const search = useRef({ value: "", at: 0 });
  const selected = options.findIndex((option) => option.value === value);

  const measure = useCallback(() => {
    const rect = trigger.current!.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 160), window.innerWidth - 24);
    const desired = Math.min(options.length * 40 + 12, 280);
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const upwards = below < desired && above > below;
    const maxHeight = Math.max(
      60,
      Math.min(desired, upwards ? above - 8 : below - 8),
    );
    setPosition({
      top: upwards ? rect.top - maxHeight - 6 : rect.bottom + 6,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      width,
      maxHeight,
    });
  }, [options.length]);
  function show(
    index = selected >= 0 && !options[selected].disabled
      ? selected
      : options.findIndex((o) => !o.disabled),
  ) {
    if (disabled || !options.length) return;
    measure();
    setActive(Math.max(0, index));
    setOpen(true);
  }
  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    onValueChange(option.value);
    setOpen(false);
    trigger.current?.focus();
  }
  function move(direction: number) {
    let next = active;
    for (let i = 0; i < options.length; i++) {
      next = (next + direction + options.length) % options.length;
      if (!options[next].disabled) break;
    }
    setActive(next);
  }
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (
      ["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(event.key)
    ) {
      event.preventDefault();
      if (event.key === "Home" || event.key === "End") {
        const index =
          event.key === "Home"
            ? options.findIndex((o) => !o.disabled)
            : options.findLastIndex((o) => !o.disabled);
        if (open) setActive(Math.max(0, index));
        else show(index);
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (open) move(event.key === "ArrowDown" ? 1 : -1);
        else show();
      } else if (open) choose(active);
      else show();
      return;
    }
    if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      const now = Date.now();
      search.current.value =
        (now - search.current.at > 700 ? "" : search.current.value) +
        event.key.toLowerCase();
      search.current.at = now;
      const match = options.findIndex(
        (option) =>
          !option.disabled &&
          option.label
            .toLowerCase()
            .replace(/^[^\p{L}\p{N}]+/u, "")
            .startsWith(search.current.value),
      );
      if (match >= 0) {
        if (!open) show(match);
        else setActive(match);
      }
    }
  }
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (
        !trigger.current?.contains(event.target as Node) &&
        !menu.current?.contains(event.target as Node)
      )
        setOpen(false);
    }
    // Follow the trigger when the page scrolls; the portal stays outside clipped panels.
    function onScroll(event: Event) {
      if (!menu.current?.contains(event.target as Node)) measure();
    }
    function resize() {
      setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", resize);
    };
  }, [open, measure]);
  useEffect(() => {
    const list = menu.current;
    const option = list?.querySelector<HTMLElement>('[data-active="true"]');
    if (!open || !list || !option) return;
    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight)
      list.scrollTop = bottom - list.clientHeight;
  }, [active, open]);
  const expanded = open && !disabled;
  return (
    <div
      className={`${styles.root} ${stretch ? styles.stretch : ""} ${className}`}
    >
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        role="combobox"
        aria-label={label}
        aria-expanded={expanded}
        aria-haspopup="listbox"
        aria-controls={`${id}-options`}
        aria-activedescendant={expanded ? `${id}-option-${active}` : undefined}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onBlur={(event) => {
          if (!menu.current?.contains(event.relatedTarget)) setOpen(false);
        }}
        onClick={() => {
          if (expanded) setOpen(false);
          else show();
        }}
      >
        <span className={styles.value}>
          {options[selected]?.icon}
          {options[selected]?.label ?? "Choose an option"}
        </span>
        <svg
          className={styles.chevron}
          data-open={expanded}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {expanded &&
        createPortal(
          <div role="region" aria-label={`${label} choices`}>
            <div
              ref={menu}
              id={`${id}-options`}
              className={styles.menu}
              role="listbox"
              aria-label={label}
              style={position}
            >
              {options.map((option, index) => (
                <div
                  key={option.value}
                  id={`${id}-option-${index}`}
                  role="option"
                  aria-selected={option.value === value}
                  aria-disabled={option.disabled || undefined}
                  tabIndex={-1}
                  data-active={active === index}
                  className={styles.option}
                  onPointerMove={() => {
                    if (!option.disabled) setActive(index);
                  }}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(index)}
                  onKeyDown={onKeyDown}
                >
                  <span className={styles.optionLabel}>
                    {option.icon}
                    {option.label}
                  </span>
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                    className={
                      option.value === value ? styles.check : styles.hiddenCheck
                    }
                  >
                    <path
                      d="m5 12 4 4L19 6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
