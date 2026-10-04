"use client";

import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import styles from "./date-picker.module.css";

interface DatePickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

function toISO(date: Date) {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function fromISO(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const date = new Date(0);
  date.setFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setHours(0, 0, 0, 0);
  return toISO(date) === value ? date : null;
}

function localDate(year: number, month: number, day: number) {
  const date = new Date(0);
  date.setFullYear(year, month, day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function monthStart(date: Date) {
  return localDate(date.getFullYear(), date.getMonth(), 1);
}

function daysInMonth(year: number, month: number) {
  return localDate(year, month + 1, 0).getDate();
}

function getCalendarDays(month: Date) {
  const first = monthStart(month);
  const start = localDate(
    first.getFullYear(),
    first.getMonth(),
    1 - first.getDay(),
  );
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

export default function DatePicker({
  label,
  value,
  onChange,
  readOnly = false,
}: DatePickerProps) {
  const id = useId().replace(/:/g, "");
  const trigger = useRef<HTMLButtonElement>(null);
  const calendar = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [displayMonth, setDisplayMonth] = useState(() =>
    monthStart(fromISO(value) ?? new Date()),
  );
  const [focusedDate, setFocusedDate] = useState(value);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 300 });
  const calendarDays = getCalendarDays(displayMonth);
  const monthLabel = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(displayMonth);

  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  }, []);

  const updatePosition = useCallback(() => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;

    const width = Math.min(300, window.innerWidth - 24);
    const estimatedHeight = 350;
    const below = window.innerHeight - rect.bottom;
    const top =
      below >= estimatedHeight + 12
        ? rect.bottom + 6
        : Math.max(12, rect.top - estimatedHeight - 6);
    const left = Math.max(
      12,
      Math.min(rect.left, window.innerWidth - width - 12),
    );
    setPosition({ top, left, width });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();

    function onPointerDown(event: PointerEvent) {
      if (
        !calendar.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        setOpen(false);
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        close();
      }
    }
    function onScrollOrResize() {
      updatePosition();
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [close, open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    calendar.current
      ?.querySelector<HTMLButtonElement>(`[data-date="${focusedDate}"]`)
      ?.focus();
  }, [focusedDate, open, displayMonth]);

  function openCalendar() {
    if (readOnly) return;
    const selected = fromISO(value) ?? new Date();
    setDisplayMonth(monthStart(selected));
    setFocusedDate(toISO(selected));
    setOpen(true);
  }

  function chooseDate(date: Date) {
    onChange(toISO(date));
    close();
  }

  function moveFocus(date: Date) {
    setFocusedDate(toISO(date));
    setDisplayMonth(monthStart(date));
  }

  function moveMonth(amount: number) {
    const current = fromISO(focusedDate) ?? fromISO(value) ?? new Date();
    const year = displayMonth.getFullYear();
    const month = displayMonth.getMonth() + amount;
    const targetYear = year + Math.floor(month / 12);
    const targetMonth = ((month % 12) + 12) % 12;
    const target = localDate(
      targetYear,
      targetMonth,
      Math.min(current.getDate(), daysInMonth(targetYear, targetMonth)),
    );
    moveFocus(target);
  }

  function onDayKeyDown(event: KeyboardEvent<HTMLButtonElement>, date: Date) {
    let next: Date | null = null;
    if (event.key === "ArrowLeft")
      next = localDate(date.getFullYear(), date.getMonth(), date.getDate() - 1);
    else if (event.key === "ArrowRight")
      next = localDate(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    else if (event.key === "ArrowUp")
      next = localDate(date.getFullYear(), date.getMonth(), date.getDate() - 7);
    else if (event.key === "ArrowDown")
      next = localDate(date.getFullYear(), date.getMonth(), date.getDate() + 7);
    else if (event.key === "Home")
      next = localDate(
        date.getFullYear(),
        date.getMonth(),
        date.getDate() - date.getDay(),
      );
    else if (event.key === "End")
      next = localDate(
        date.getFullYear(),
        date.getMonth(),
        date.getDate() + (6 - date.getDay()),
      );
    else if (event.key === "PageUp") {
      event.preventDefault();
      moveMonth(event.shiftKey ? -12 : -1);
      return;
    } else if (event.key === "PageDown") {
      event.preventDefault();
      moveMonth(event.shiftKey ? 12 : 1);
      return;
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      chooseDate(date);
      return;
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }

    if (next) {
      event.preventDefault();
      moveFocus(next);
    }
  }

  return (
    <div className={styles.root}>
      <label htmlFor={`${id}-value`}>{label}</label>
      <div className={styles.control}>
        <input id={`${id}-value`} type="text" readOnly value={value} />
        <button
          ref={trigger}
          type="button"
          aria-label={`Open calendar for ${label}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? `${id}-calendar` : undefined}
          disabled={readOnly}
          onClick={() => (open ? close() : openCalendar())}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M16 3v4M8 3v4M3 10h18" />
          </svg>
        </button>
      </div>
      {open &&
        createPortal(
          <div
            ref={calendar}
            id={`${id}-calendar`}
            className={styles.calendar}
            role="dialog"
            aria-label={`${label} calendar`}
            style={position}
          >
            <div className={styles.monthHeader}>
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => moveMonth(-1)}
              >
                ‹
              </button>
              <h2 aria-live="polite">{monthLabel}</h2>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => moveMonth(1)}
              >
                ›
              </button>
            </div>
            <div className={styles.weekdays} aria-hidden="true">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className={styles.days}>
              {calendarDays.map((date) => {
                const dateValue = toISO(date);
                const selected = dateValue === value;
                const inMonth = date.getMonth() === displayMonth.getMonth();
                return (
                  <button
                    key={dateValue}
                    type="button"
                    data-date={dateValue}
                    tabIndex={dateValue === focusedDate ? 0 : -1}
                    aria-label={`Select ${date.toLocaleDateString(undefined, {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}`}
                    aria-pressed={selected}
                    data-selected={selected || undefined}
                    data-in-month={inMonth || undefined}
                    onFocus={() => setFocusedDate(dateValue)}
                    onKeyDown={(event) => onDayKeyDown(event, date)}
                    onClick={() => chooseDate(date)}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
