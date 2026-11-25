import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Compass, Sparkles, X } from 'lucide-react';
import { PAGE_GUIDES } from '../data/guideContent.ts';
import type { TourPageKey } from '../types.ts';

interface PageTourOverlayProps {
  pageKey: TourPageKey;
  onComplete: (pageKey: TourPageKey) => Promise<void> | void;
  onDismiss: () => void;
}

export function PageTourOverlay({
  pageKey,
  onComplete,
  onDismiss,
}: PageTourOverlayProps) {
  const guide = PAGE_GUIDES[pageKey];
  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setStepIndex(0);
  }, [pageKey]);

  if (!guide || guide.steps.length === 0) return null;

  const steps = guide.steps;
  const currentStep = steps[Math.min(stepIndex, steps.length - 1)];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex >= steps.length - 1;

  async function handleFinishOrSkip() {
    setSubmitting(true);
    try {
      await onComplete(pageKey);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${guide.title} Interactive Tour`}
      className="no-print fixed inset-0 z-50 bg-[#0F172A]/60 dark:bg-black/75 backdrop-blur-[2px] flex items-center justify-center p-4"
    >
      <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#334155] rounded-lg max-w-xl w-full shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-[#F8FAFC] dark:bg-[#0F172A] border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-8 h-8 rounded-md bg-[#EFF6FF] dark:bg-[#1E3A8A]/40 border border-[#BFDBFE] dark:border-[#1D4ED8]/40 flex items-center justify-center shrink-0 mt-0.5">
              <Compass className="w-4 h-4 text-[#1D4ED8] dark:text-[#60A5FA]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[#1D4ED8] dark:text-[#60A5FA]">
                  Page Tour · Step {stepIndex + 1} of {steps.length}
                </span>
              </div>
              <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                {guide.title}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={handleFinishOrSkip}
            disabled={submitting}
            title="Skip & mark tour completed"
            className="p-1.5 text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step Progress Strip */}
        <div className="px-6 pt-4">
          <div className="flex items-center gap-1.5">
            {steps.map((s, idx) => (
              <button
                key={s.title}
                type="button"
                onClick={() => setStepIndex(idx)}
                title={`Step ${idx + 1}: ${s.title}`}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  idx <= stepIndex
                    ? 'bg-[#1D4ED8] dark:bg-[#3B82F6]'
                    : 'bg-[#E2E8F0] dark:bg-[#1E293B]'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Active Step Content */}
        <div className="p-6 space-y-4">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono font-medium bg-[#F1F5F9] dark:bg-[#0F172A] text-[#475569] dark:text-[#CBD5E1] border border-[#E2E8F0] dark:border-[#334155] rounded">
            <span>Focus Area: {currentStep.targetArea}</span>
          </div>

          <div>
            <h4 className="font-display text-lg font-bold text-[#0F172A] dark:text-[#F8FAFC] mb-2">
              {currentStep.title}
            </h4>
            <p className="text-sm text-[#334155] dark:text-[#CBD5E1] leading-relaxed">
              {currentStep.description}
            </p>
          </div>

          {currentStep.tip && (
            <div className="px-3.5 py-2.5 bg-[#EFF6FF] dark:bg-[#1E3A8A]/25 border border-[#BFDBFE] dark:border-[#1E40AF] rounded-md flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-[#1D4ED8] dark:text-[#60A5FA] shrink-0 mt-0.5" />
              <p className="text-xs text-[#1E3A8A] dark:text-[#BFDBFE] leading-relaxed">
                <strong className="font-semibold">Tip:</strong> {currentStep.tip}
              </p>
            </div>
          )}

          {isFirst && (
            <div className="pt-2 border-t border-[#E2E8F0] dark:border-[#1E293B] text-xs text-[#64748B] dark:text-[#94A3B8]">
              {guide.rolesNote} You can replay any page tour anytime from{' '}
              <span className="font-semibold text-[#334155] dark:text-[#CBD5E1]">How to Use</span>.
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="px-6 py-4 bg-[#F8FAFC] dark:bg-[#0F172A] border-t border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleFinishOrSkip}
              disabled={submitting}
              className="px-3 py-1.5 text-xs font-medium text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] transition-colors"
            >
              Skip Tour
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="px-3 py-1.5 text-xs font-medium text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] transition-colors"
            >
              Remind Me Later
            </button>
          </div>

          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                type="button"
                onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[#334155] dark:text-[#CBD5E1] bg-white dark:bg-[#111827] border border-[#CBD5E1] dark:border-[#334155] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] rounded-md transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            )}

            {!isLast ? (
              <button
                type="button"
                onClick={() => setStepIndex((i) => Math.min(steps.length - 1, i + 1))}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-md transition-colors"
              >
                <span>Next</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={handleFinishOrSkip}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-60 rounded-md transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{submitting ? 'Saving...' : 'Finish Tour'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
