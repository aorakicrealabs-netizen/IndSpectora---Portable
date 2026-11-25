import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Compass,
  HelpCircle,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  Minus,
  X,
} from 'lucide-react';
import {
  APP_FAQ_ITEMS,
  FAQ_CATEGORIES,
  filterVisibleGuides,
  ROLE_CAPABILITY_MATRIX,
  type FaqCategory,
} from '../data/guideContent.ts';
import type { TourPageKey, User } from '../types.ts';
import { formatRoleLabel } from '../types.ts';

interface HowToUsePageProps {
  currentUser: User;
  completedTours: TourPageKey[];
  onStartTour: (pageKey: TourPageKey) => void;
  onResetAllTours: () => Promise<void>;
}

const FAQ_CATEGORY_LABEL_MAP = new Map(FAQ_CATEGORIES.map((c) => [c.key, c.label]));

export function HowToUsePage({
  currentUser,
  completedTours,
  onStartTour,
  onResetAllTours,
}: HowToUsePageProps) {
  const [resetting, setResetting] = useState(false);
  const [selectedKey, setSelectedKey] = useState<TourPageKey>('dashboard');
  const [faqQuery, setFaqQuery] = useState('');
  const [faqCategory, setFaqCategory] = useState<FaqCategory>('all');
  const [openFaqIds, setOpenFaqIds] = useState<Set<string>>(
    () => new Set([APP_FAQ_ITEMS[0]?.id ?? 'faq-roles-difference'])
  );

  const userRoles = useMemo(
    () => (currentUser.roles && currentUser.roles.length > 0 ? currentUser.roles : [currentUser.role]),
    [currentUser]
  );
  const guides = useMemo(() => filterVisibleGuides(userRoles), [userRoles]);

  const activeGuide = useMemo(
    () => guides.find((g) => g.key === selectedKey) ?? guides[0],
    [guides, selectedKey]
  );

  const filteredFaqs = useMemo(() => {
    const q = faqQuery.trim().toLowerCase();
    return APP_FAQ_ITEMS.filter((item) => {
      if (faqCategory !== 'all' && item.category !== faqCategory) return false;
      if (!q) return true;
      const haystack = [
        item.question,
        item.answer,
        ...(item.steps ?? []),
        item.appliesTo,
        ...item.keywords,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [faqCategory, faqQuery]);

  async function handleResetTours() {
    setResetting(true);
    try {
      await onResetAllTours();
    } finally {
      setResetting(false);
    }
  }

  function toggleFaq(id: string) {
    setOpenFaqIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleExpandAllFaqs() {
    setOpenFaqIds(new Set(filteredFaqs.map((item) => item.id)));
  }

  function handleCollapseAllFaqs() {
    setOpenFaqIds(new Set());
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg p-4 sm:p-6 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 text-xs font-mono font-semibold text-[#1D4ED8] dark:text-[#60A5FA] mb-1.5">
            <BookOpen className="w-4 h-4" />
            <span>IndSpectora User Guide &amp; Interactive Tours</span>
          </div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-[#0F172A] dark:text-[#F8FAFC] tracking-tight">
            How to Use IndSpectora
          </h1>
          <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] mt-1.5 leading-relaxed">
            Explore step-by-step operating instructions organized by workspace page, review
            multi-role access rules, browse common workflow FAQs, or relaunch any interactive
            walkthrough tour.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#64748B] dark:text-[#94A3B8]">
            <span>Signed in as:</span>
            <span className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">{currentUser.name}</span>
            <span aria-hidden="true">·</span>
            <span className="font-medium text-[#1D4ED8] dark:text-[#93C5FD]">
              {userRoles.map((r) => formatRoleLabel(r)).join(' · ')}
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto shrink-0">
          <button
            type="button"
            disabled={resetting}
            onClick={handleResetTours}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[40px] text-xs font-medium text-[#334155] dark:text-[#CBD5E1] bg-[#F8FAFC] dark:bg-[#0F172A] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#334155] disabled:opacity-60 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{resetting ? 'Resetting Tours...' : 'Reset All First-Time Tours'}</span>
          </button>
          <button
            type="button"
            onClick={() => onStartTour('howto')}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[40px] text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Tour This Page</span>
          </button>
        </div>
      </div>

      {/* Per-Page Documentation Selector + Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Page Index Cards */}
        <div className="lg:col-span-4 space-y-2.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8] px-1">
            Workspace Guides ({guides.length})
          </div>
          {guides.map((guide) => {
            const isSelected = activeGuide?.key === guide.key;
            const isDone = completedTours.includes(guide.key);
            return (
              <div
                key={guide.key}
                className={`border rounded-lg p-4 transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[#EFF6FF] dark:bg-[#1E3A8A]/30 border-[#1D4ED8] dark:border-[#3B82F6]'
                    : 'bg-white dark:bg-[#111827] border-[#E2E8F0] dark:border-[#1E293B] hover:border-[#CBD5E1] dark:hover:border-[#334155]'
                }`}
                onClick={() => setSelectedKey(guide.key)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-display text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                      {guide.title}
                    </h2>
                    <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1 line-clamp-2">
                      {guide.subtitle}
                    </p>
                  </div>
                  {isDone ? (
                    <span
                      title="Tour completed"
                      className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-[#16A34A] dark:text-[#4ADE80] shrink-0"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Toured</span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono font-medium text-[#D97706] dark:text-[#FBBF24] shrink-0">
                      New
                    </span>
                  )}
                </div>

                <div className="mt-3 pt-2.5 border-t border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between">
                  <span className="font-mono tabular-nums text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                    {guide.steps.length} tour steps
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartTour(guide.key);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-[#1D4ED8] dark:text-[#60A5FA] hover:bg-white dark:hover:bg-[#0F172A] rounded transition-colors whitespace-nowrap shrink-0"
                  >
                    <Play className="w-3 h-3" />
                    <span>Launch Tour</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Page Walkthrough Panel */}
        {activeGuide && (
          <div className="lg:col-span-8 bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg overflow-hidden">
            <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-[#E2E8F0] dark:border-[#1E293B] flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                  {activeGuide.title}
                </h2>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                  {activeGuide.rolesNote}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onStartTour(activeGuide.key)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Open &amp; Start Interactive Tour</span>
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-6">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8] mb-2">
                  Workflow Overview
                </h3>
                <p className="text-sm text-[#334155] dark:text-[#CBD5E1] leading-relaxed">
                  {activeGuide.summary}
                </p>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8] mb-3">
                  Key Steps &amp; Controls
                </h3>
                <div className="divide-y divide-[#E2E8F0] dark:divide-[#1E293B] border border-[#E2E8F0] dark:border-[#1E293B] rounded-md overflow-hidden">
                  {activeGuide.steps.map((step, index) => (
                    <div
                      key={step.title}
                      className="p-4 bg-[#F8FAFC]/60 dark:bg-[#0F172A]/60"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-[#1D4ED8] text-white font-mono tabular-nums text-[11px] font-bold flex items-center justify-center shrink-0">
                            {index + 1}
                          </span>
                          <span className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                            {step.title}
                          </span>
                        </div>
                        <span className="font-mono text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                          {step.targetArea}
                        </span>
                      </div>
                      <p className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed sm:pl-7">
                        {step.description}
                      </p>
                      {step.tip && (
                        <p className="text-xs text-[#1D4ED8] dark:text-[#60A5FA] mt-1.5 sm:pl-7">
                          Tip: {step.tip}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8] mb-2.5">
                  Quick Operating Checklist
                </h3>
                <ul className="space-y-2">
                  {activeGuide.checklist.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2.5 text-xs text-[#334155] dark:text-[#CBD5E1]"
                    >
                      <CheckCircle2 className="w-4 h-4 text-[#16A34A] dark:text-[#4ADE80] shrink-0 mt-0.5" />
                      <span className="leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Multi-Role Capability Matrix */}
      <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-[#1D4ED8] dark:text-[#60A5FA]" />
          <div>
            <h2 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
              Role Privileges &amp; Multi-Role Matrix
            </h2>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
              A user can hold multiple roles simultaneously (e.g., Approver + User, or Admin + Approver).
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F8FAFC] dark:bg-[#0F172A] border-b border-[#E2E8F0] dark:border-[#1E293B] text-[11px] font-semibold text-[#475569] dark:text-[#94A3B8]">
                <th className="py-3 px-4">Operation / Capability</th>
                <th className="py-3 px-4 text-center w-24">Admin</th>
                <th className="py-3 px-4 text-center w-24">Approver</th>
                <th className="py-3 px-4 text-center w-24">User</th>
                <th className="py-3 px-4">Operational Rule</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#1E293B] text-xs">
              {ROLE_CAPABILITY_MATRIX.map((row) => (
                <tr
                  key={row.capability}
                  className="hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B]/40 transition-colors"
                >
                  <td className="py-3 px-4 font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                    {row.capability}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {row.admin ? (
                      <Check className="w-4 h-4 text-[#16A34A] dark:text-[#4ADE80] mx-auto" />
                    ) : (
                      <Minus className="w-4 h-4 text-[#CBD5E1] dark:text-[#334155] mx-auto" />
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {row.approver ? (
                      <Check className="w-4 h-4 text-[#16A34A] dark:text-[#4ADE80] mx-auto" />
                    ) : (
                      <Minus className="w-4 h-4 text-[#CBD5E1] dark:text-[#334155] mx-auto" />
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {row.user ? (
                      <Check className="w-4 h-4 text-[#16A34A] dark:text-[#4ADE80] mx-auto" />
                    ) : (
                      <Minus className="w-4 h-4 text-[#CBD5E1] dark:text-[#334155] mx-auto" />
                    )}
                  </td>
                  <td className="py-3 px-4 text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                    {row.notes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Interactive Frequently Asked Questions (FAQ) */}
      <section
        id="indspectora-faq"
        className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-lg overflow-hidden"
      >
        <div className="px-6 py-5 border-b border-[#E2E8F0] dark:border-[#1E293B] flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-mono font-semibold text-[#1D4ED8] dark:text-[#60A5FA] mb-1">
              <HelpCircle className="w-4 h-4" />
              <span>Frequently Asked Questions</span>
            </div>
            <h2 className="font-display text-lg font-bold text-[#0F172A] dark:text-[#F8FAFC]">
              IndSpectora Usage &amp; Operations FAQ
            </h2>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
              Quick answers on multi-role permissions, CSV imports, custom parameters, sequential approvals, WBS tracking, and localhost data storage.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="font-mono tabular-nums text-xs text-[#64748B] dark:text-[#94A3B8] mr-1">
              {filteredFaqs.length} of {APP_FAQ_ITEMS.length} questions
            </span>
            <button
              type="button"
              onClick={handleExpandAllFaqs}
              className="px-3 py-1.5 text-xs font-medium text-[#334155] dark:text-[#CBD5E1] bg-[#F8FAFC] dark:bg-[#0F172A] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#334155] rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              Expand All
            </button>
            <button
              type="button"
              onClick={handleCollapseAllFaqs}
              className="px-3 py-1.5 text-xs font-medium text-[#334155] dark:text-[#CBD5E1] bg-[#F8FAFC] dark:bg-[#0F172A] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#334155] rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              Collapse All
            </button>
          </div>
        </div>

        {/* Search + Segmented Category Filter Bar */}
        <div className="px-6 py-4 bg-[#F8FAFC] dark:bg-[#0F172A]/60 border-b border-[#E2E8F0] dark:border-[#1E293B] space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#64748B] dark:text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={faqQuery}
              onChange={(e) => setFaqQuery(e.target.value)}
              placeholder="Search FAQ by topic, role, CSV, WBS, approval, or SQLite..."
              aria-label="Search frequently asked questions"
              className="w-full pl-9 pr-9 py-2 text-xs bg-white dark:bg-[#111827] text-[#0F172A] dark:text-[#F8FAFC] placeholder-[#94A3B8] border border-[#CBD5E1] dark:border-[#334155] rounded-md focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/30 focus:border-[#1D4ED8]"
            />
            {faqQuery && (
              <button
                type="button"
                onClick={() => setFaqQuery('')}
                aria-label="Clear FAQ search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#64748B] hover:text-[#0F172A] dark:text-[#94A3B8] dark:hover:text-[#F8FAFC]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex sm:flex-wrap items-center gap-1.5 overflow-x-auto max-w-full pb-1 sm:pb-0" role="tablist" aria-label="FAQ Categories">
            {FAQ_CATEGORIES.map((cat) => {
              const active = faqCategory === cat.key;
              return (
                <button
                  key={cat.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFaqCategory(cat.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#1D4ED8] text-white'
                      : 'bg-white dark:bg-[#111827] text-[#475569] dark:text-[#94A3B8] border border-[#E2E8F0] dark:border-[#1E293B] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* FAQ Accordion List */}
        {filteredFaqs.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm font-medium text-[#0F172A] dark:text-[#F8FAFC]">
              No matching FAQ entries found.
            </p>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
              Try a broader search term or reset the category filter to view all topics.
            </p>
            <button
              type="button"
              onClick={() => {
                setFaqQuery('');
                setFaqCategory('all');
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              Clear Search Filters
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[#E2E8F0] dark:divide-[#1E293B]">
            {filteredFaqs.map((item) => {
              const isOpen = openFaqIds.has(item.id);
              const catLabel = FAQ_CATEGORY_LABEL_MAP.get(item.category) ?? item.category;
              const canJumpToTour =
                item.relatedPageKey &&
                (item.relatedPageKey !== 'users' || userRoles.includes('admin'));

              return (
                <div key={item.id} className="transition-colors">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => toggleFaq(item.id)}
                    className="w-full px-6 py-4 text-left flex items-start justify-between gap-4 hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B]/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1D4ED8]"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                        <span className="font-medium text-[#1D4ED8] dark:text-[#60A5FA]">
                          {catLabel}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Applies to: {item.appliesTo}</span>
                      </div>
                      <h3 className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC] leading-snug">
                        {item.question}
                      </h3>
                    </div>

                    <ChevronDown
                      className={`w-4 h-4 text-[#64748B] dark:text-[#94A3B8] shrink-0 mt-1 transition-transform duration-150 ${
                        isOpen ? 'rotate-180 text-[#1D4ED8] dark:text-[#60A5FA]' : ''
                      }`}
                    />
                  </button>

                  {isOpen && (
                    <div className="px-6 pb-5 pt-0.5 space-y-3 bg-[#F8FAFC]/50 dark:bg-[#0F172A]/40">
                      <p className="text-xs sm:text-[13px] text-[#334155] dark:text-[#CBD5E1] leading-relaxed max-w-4xl">
                        {item.answer}
                      </p>

                      {item.steps && item.steps.length > 0 && (
                        <ol className="space-y-1.5 pl-4 list-decimal text-xs text-[#475569] dark:text-[#94A3B8] max-w-4xl">
                          {item.steps.map((stepText) => (
                            <li key={stepText} className="leading-relaxed pl-1">
                              {stepText}
                            </li>
                          ))}
                        </ol>
                      )}

                      {canJumpToTour && item.relatedPageKey && (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => onStartTour(item.relatedPageKey!)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-[#1D4ED8] dark:text-[#60A5FA] hover:bg-[#EFF6FF] dark:hover:bg-[#1E3A8A]/30 border border-[#BFDBFE] dark:border-[#1E40AF] rounded-md transition-colors whitespace-nowrap shrink-0"
                          >
                            <Play className="w-3 h-3" />
                            <span>Open Workspace &amp; Launch Tour</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
