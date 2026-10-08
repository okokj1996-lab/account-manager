"use client"

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronDown } from "lucide-react"
import { cn } from "cn"

export type VaultSelectOption = {
  value: string
  label: string
  disabled?: boolean
}

export function VaultSelect({
  id,
  value,
  options,
  onChange,
  ariaLabel,
  className,
  disabled = false,
}: {
  id?: string
  value: string
  options: VaultSelectOption[]
  onChange: (value: string) => void
  ariaLabel?: string
  className?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const selected = options.find((option) => option.value === value)
  const label = selected?.label ?? value

  function firstEnabled(from: number, direction: 1 | -1): number {
    let index = from
    while (index >= 0 && index < options.length) {
      if (!options[index]?.disabled) return index
      index += direction
    }
    return from
  }

  function openMenu() {
    const current = options.findIndex((option) => option.value === value)
    const start =
      current >= 0 && !options[current]?.disabled
        ? current
        : options.findIndex((option) => !option.disabled)
    setActiveIndex(Math.max(0, start))
    setOpen(true)
  }

  function closeMenu() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  function choose(option: VaultSelectOption | undefined) {
    if (!option || option.disabled) return
    onChange(option.value)
    setOpen(false)
    triggerRef.current?.focus()
  }

  function move(direction: 1 | -1) {
    setActiveIndex((current) => {
      const next = current + direction
      if (next < 0 || next >= options.length) return current
      return firstEnabled(next, direction)
    })
  }

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown, true)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown, true)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    function place() {
      const trigger = triggerRef.current
      const menu = menuRef.current
      if (!trigger || !menu) return
      const triggerRect = trigger.getBoundingClientRect()
      const dialog = menu.closest("[data-slot='dialog-content']")
      const origin = dialog?.getBoundingClientRect() ?? { top: 0, left: 0 }
      const gap = 4
      const spaceBelow = window.innerHeight - triggerRect.bottom - gap - 8
      const spaceAbove = triggerRect.top - gap - 8
      const openUp = spaceBelow < 160 && spaceAbove > spaceBelow
      const maxHeight = Math.max(120, openUp ? spaceAbove : spaceBelow)
      menu.style.maxHeight = `${maxHeight}px`
      const height = Math.min(menu.scrollHeight, maxHeight)
      const top = openUp ? triggerRect.top - height - gap : triggerRect.bottom + gap
      const width = Math.max(triggerRect.width, menu.offsetWidth)
      let left = triggerRect.left
      if (left + width > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - width - 8)
      }
      menu.style.top = `${top - origin.top}px`
      menu.style.left = `${left - origin.left}px`
      menu.style.minWidth = `${triggerRect.width}px`
    }
    place()
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    return () => {
      window.removeEventListener("resize", place)
      window.removeEventListener("scroll", place, true)
    }
  }, [open, options])

  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLElement>("[data-active='true']")?.scrollIntoView({
      block: "nearest",
    })
  }, [open, activeIndex])

  const portalTarget =
    triggerRef.current?.closest("[data-slot='dialog-content']") ??
    (typeof document === "undefined" ? null : document.body)

  const menu =
    open && portalTarget
      ? createPortal(
          <div
            ref={menuRef}
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            className="fixed z-[80] overflow-y-auto rounded-lg border border-white/12 bg-[#0b1625] p-1 shadow-lg"
            onMouseDown={(event) => event.preventDefault()}
          >
            {options.map((option, index) => {
              const selectedOption = option.value === value
              const active = index === activeIndex
              return (
                <button
                  key={option.value}
                  id={`${listId}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={selectedOption}
                  aria-disabled={option.disabled || undefined}
                  data-active={active ? "true" : undefined}
                  disabled={option.disabled}
                  className={cn(
                    "flex w-full rounded-md px-2.5 py-2 text-left text-sm text-[#f4ead7]",
                    active && "bg-[#1c314c]",
                    selectedOption && "font-medium text-[#f0c56d]",
                    option.disabled && "text-[#a89880]"
                  )}
                  onMouseEnter={() => {
                    if (!option.disabled) setActiveIndex(index)
                  }}
                  onClick={() => choose(option)}
                >
                  {option.label}
                </button>
              )
            })}
          </div>,
          portalTarget
        )
      : null

  return (
    <div ref={rootRef} className={cn("relative w-max max-w-full", className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
        className="inline-flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-input bg-[#0b1625] px-2.5 text-left text-sm text-[#f4ead7] outline-none focus-visible:ring-2 focus-visible:ring-[var(--zeus-gold)] disabled:opacity-50"
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={(event) => {
          if (disabled) return
          if (!open) {
            if (
              event.key === "ArrowDown" ||
              event.key === "ArrowUp" ||
              event.key === "Enter" ||
              event.key === " "
            ) {
              event.preventDefault()
              openMenu()
            }
            return
          }
          if (event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
            closeMenu()
            return
          }
          if (event.key === "ArrowDown") {
            event.preventDefault()
            move(1)
            return
          }
          if (event.key === "ArrowUp") {
            event.preventDefault()
            move(-1)
            return
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            choose(options[activeIndex])
          }
        }}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="size-3.5 shrink-0 text-[var(--zeus-mist)]" aria-hidden />
      </button>
      {menu}
    </div>
  )
}
