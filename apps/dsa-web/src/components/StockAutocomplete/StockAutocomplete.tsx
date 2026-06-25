/**
 * StockAutocomplete Component
 *
 * Stock code/name autocomplete input box
 * Supports keyboard navigation, IME input method, graceful degradation
 */

import { Component, useRef, useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useStockIndex } from '../../hooks/useStockIndex';
import { useAutocomplete } from '../../hooks/useAutocomplete';
import { SuggestionsList } from './SuggestionsList';
import { cn } from '../../utils/cn';

const AUTOCOMPLETE_INPUT_CLASS =
  'input-surface input-focus-glow h-11 w-full rounded-xl border bg-transparent px-4 text-sm transition-all focus:outline-none disabled:cursor-not-allowed disabled:opacity-60';

const HOME_AUTOCOMPLETE_INPUT_CLASS =
  'h-[48px] w-full border-0 bg-transparent px-0 text-[16px] font-semibold leading-[22px] text-slate-100 shadow-none outline-none transition-colors placeholder:text-[#808080] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60';

const HOME_AUTOCOMPLETE_FRAME_CLASS =
  'stock-autocomplete flex min-h-[80px] min-w-0 flex-col justify-center gap-[12px] rounded-[12px] border-2 border-solid border-transparent p-[12px] shadow-[0_10px_10px_rgba(0,0,0,0.1)] transition-colors md:h-[80px] md:flex-row md:items-center md:gap-[20px] md:px-[20px] md:py-[12px]';

const HOME_AUTOCOMPLETE_FRAME_STYLE = {
  background:
    'linear-gradient(#171a21, #171a21) padding-box, linear-gradient(270deg, #00D4FF 0%, #FFBC33 33.65%, #FF5151 64.9%, #00D4FF 90.38%) border-box',
};

const HOME_AUTOCOMPLETE_ACTION_CLASS =
  'flex h-[48px] w-full flex-shrink-0 items-center justify-center gap-[8px] rounded-full border-0 bg-[#00a1c2] px-[20px] text-[16px] font-semibold leading-[22px] text-white transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 md:w-[200px]';

export interface StockAutocompleteProps {
  /** Input value */
  value: string;
  /** Value change callback */
  onChange: (value: string) => void;
  /** Submit callback (code, name, source) */
  onSubmit: (code: string, name?: string, source?: 'manual' | 'autocomplete') => void;
  /** Whether disabled */
  disabled?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Additional CSS class name */
  className?: string;
  /** Visual appearance variant */
  appearance?: 'default' | 'home';
  /** Label for the home appearance action button */
  actionLabel?: string;
  /** Label shown while the parent is submitting */
  submittingLabel?: string;
  /** Whether the parent submit action is in progress */
  isSubmitting?: boolean;
}

function getInputClassName(appearance: StockAutocompleteProps['appearance']) {
  return appearance === 'home' ? HOME_AUTOCOMPLETE_INPUT_CLASS : AUTOCOMPLETE_INPUT_CLASS;
}

function FallbackInput({
  value,
  onChange,
  onSubmit,
  disabled = false,
  placeholder = '输入股票代码或名称',
  className,
  appearance = 'default',
}: StockAutocompleteProps) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !disabled && value) {
          onSubmit(value);
        }
      }}
      placeholder={placeholder}
      disabled={disabled}
      className={cn(getInputClassName(appearance), className)}
      data-autocomplete-mode="fallback"
    />
  );
}

interface StockAutocompleteBoundaryProps extends StockAutocompleteProps {
  children: ReactNode;
}

interface StockAutocompleteBoundaryState {
  hasError: boolean;
}

class StockAutocompleteBoundary extends Component<
  StockAutocompleteBoundaryProps,
  StockAutocompleteBoundaryState
> {
  override state: StockAutocompleteBoundaryState = { hasError: false };

  static getDerivedStateFromError(): StockAutocompleteBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Autocomplete runtime error. Falling back to plain input.', error, errorInfo);
  }

  override render() {
    if (this.state.hasError) {
      const { children, ...fallbackProps } = this.props;
      void children;
      return <FallbackInput {...fallbackProps} />;
    }

    return this.props.children;
  }
}

function StockAutocompleteInner({
  value,
  onChange,
  onSubmit,
  disabled = false,
  placeholder = '输入股票代码或名称',
  className,
  appearance = 'default',
  actionLabel = 'AI数据分析',
  submittingLabel = '分析中',
  isSubmitting = false,
}: StockAutocompleteProps) {
  const { index, loading, fallback } = useStockIndex();
  const {
    // query,
    setQuery,
    suggestions,
    isOpen,
    highlightedIndex,
    setHighlightedIndex,
    highlightPrevious,
    highlightNext,
    close,
    // reset,
    isComposing,
    setIsComposing,
    runtimeFallback,
    error: autocompleteError,
  } = useAutocomplete(index);

  const inputRef = useRef<HTMLInputElement>(null);
  const prevValueRef = useRef(value);
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number; width: string } | null>(null);

  const updateDropdownPosition = () => {
    if (!inputRef.current) {
      setDropdownStyle(null);
      return;
    }

    const rect = inputRef.current.getBoundingClientRect();
    setDropdownStyle({
      top: rect.bottom,
      left: rect.left,
      width: `${rect.width}px`,
    });
  };

  const closeSuggestions = () => {
    close();
    setDropdownStyle(null);
  };

  // Sync external value with internal query (only when value truly changes)
  useEffect(() => {
    if (prevValueRef.current !== value) {
      setQuery(value);
      prevValueRef.current = value;
    }
  }, [value, setQuery]);

  // Calculate suggestion box position (using fixed positioning)
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const frameId = window.requestAnimationFrame(updateDropdownPosition);
    window.addEventListener('resize', updateDropdownPosition);
    window.addEventListener('scroll', updateDropdownPosition, true);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', updateDropdownPosition);
      window.removeEventListener('scroll', updateDropdownPosition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!autocompleteError) {
      return;
    }

    console.error('Autocomplete runtime fallback activated.', autocompleteError);
  }, [autocompleteError]);

  // Keyboard event handling
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Skip if composing (IME)
    if (isComposing) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        highlightNext();
        break;
      case 'ArrowUp':
        e.preventDefault();
        highlightPrevious();
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
          // Select highlighted item
          const selected = suggestions[highlightedIndex];
          onChange(selected.displayCode);
          closeSuggestions();
          onSubmit(selected.canonicalCode, selected.nameZh, 'autocomplete');
        } else {
          // Submit directly
          onSubmit(value);
        }
        break;
      case 'Escape':
        e.preventDefault();
        closeSuggestions();
        break;
    }
  };

  // IME handling
  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionEnd = () => {
    setIsComposing(false);
  };

  // Delay closing on blur (avoid immediate close when clicking suggestion items)
  const handleBlur = () => {
    setTimeout(() => closeSuggestions(), 200);
  };

  const handleActionClick = () => {
    if (disabled || isSubmitting || !value) {
      return;
    }
    onSubmit(value);
  };

  const renderHomeFrame = (input: ReactNode, dropdown?: ReactNode) => (
    <>
      <div className={HOME_AUTOCOMPLETE_FRAME_CLASS} style={HOME_AUTOCOMPLETE_FRAME_STYLE}>
        <div className="relative min-w-0 flex-1">
          {input}
        </div>
        <button
          type="button"
          onClick={handleActionClick}
          disabled={!value || disabled || isSubmitting}
          className={HOME_AUTOCOMPLETE_ACTION_CLASS}
        >
          {isSubmitting ? (
            <>
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              {submittingLabel}
            </>
          ) : (
            actionLabel
          )}
        </button>
      </div>
      {dropdown}
    </>
  );

  // Fallback mode: use normal input
  if (fallback || loading || runtimeFallback) {
    const fallbackInput = (
      <FallbackInput
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
        appearance={appearance}
      />
    );

    return appearance === 'home' ? renderHomeFrame(fallbackInput) : fallbackInput;
  }

  const autocompleteInput = (
    <>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onFocus={() => {
          if (isOpen) {
            updateDropdownPosition();
          }
        }}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          getInputClassName(appearance),
          appearance === 'default' && isOpen && "rounded-b-none",
          className
        )}
        aria-autocomplete="none"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls="suggestions-list"
      />

      {/* Loading indicator */}
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="w-4 h-4 border-2 border-cyan/20 border-t-cyan rounded-full animate-spin" />
        </div>
      )}
    </>
  );

  const dropdown = isOpen && dropdownStyle ? createPortal(
    <SuggestionsList
      suggestions={suggestions}
      highlightedIndex={highlightedIndex}
      onSelect={(s) => {
        // Update external value (shown in input box)
        onChange(s.displayCode);
        // Close dropdown list
        closeSuggestions();
        // Submit analysis
        onSubmit(s.canonicalCode, s.nameZh, 'autocomplete');
      }}
      onMouseEnter={(index) => setHighlightedIndex(index)}
      style={{ position: 'fixed', ...dropdownStyle }}
    />,
    document.body
  ) : null;

  if (appearance === 'home') {
    return renderHomeFrame(autocompleteInput, dropdown);
  }

  return (
    <div className="relative w-full stock-autocomplete">
      {autocompleteInput}
      {dropdown}
    </div>
  );
}

export function StockAutocomplete(props: StockAutocompleteProps) {
  return (
    <StockAutocompleteBoundary {...props}>
      <StockAutocompleteInner {...props} />
    </StockAutocompleteBoundary>
  );
}

export default StockAutocomplete;
