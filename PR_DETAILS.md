# Pull Request: feat(i18n): Phase 1 - Migrate core components to next-intl

## 🌍 Overview

This PR implements **Phase 1** of the comprehensive i18n migration (#1595), converting 17 components from hardcoded English text to the **next-intl** translation framework. This enables multi-language support and improves accessibility for international users.

**Current Progress**: 17/51 components migrated (33%)
- Phase 1 Complete: 14 components
- Phase 2 (Partial): 3 additional components

## 📦 Components Migrated

### Phase 1 - Display Components (5/5) ✅
- ✅ **ProposalCard** - Proposal listing cards with state badges and vote counts
- ✅ **ProposalStateBadge** - Status badges (Pending, Active, Succeeded, Defeated, etc.)
- ✅ **VoteBar** - Vote distribution visualization (For/Against/Abstain)
- ✅ **ChallengeCountdown** - Optimistic governance challenge timer
- ✅ **CountdownTimer** - Generic countdown component for proposal deadlines

### Phase 1 - Modal Components (5/5) ✅
- ✅ **ShareButton** - Social sharing functionality
- ✅ **CoSponsorModal** - Co-sponsorship confirmation dialog
- ✅ **StakeConvictionModal** - Conviction voting stake dialog
- ✅ **VoteReceipt** - Vote confirmation display
- ✅ **VotingModal** - Main voting interface

### Phase 1 - Page Components (4/4) ✅
- ✅ **Home Page** - Proposal listing page
- ✅ **Conviction Page** - Conviction voting page
- ✅ **Conviction Detail** - Individual conviction proposal
- ✅ **Drafts Page** - Co-sponsorship drafts listing

### Phase 2 - Critical UI (3/4) ⏳
- ✅ **ErrorState** - Generic error display component
- ✅ **DelegateModal** - Delegation workflow with 22 translation keys
- ✅ **BondStatusBadge** - Bond state display with 4 translation keys
- ⏳ **NavBar** - Main navigation (high-priority, 155 lines)

## 🔤 Translation Updates

### English (`en.json`)
- Added `common.tryAgain`, `common.tryAgainLater`
- Added `delegation.*` (22 keys) - Complete delegation workflow
- Added `bonds.*` (4 keys) - Bond status display
- Added `proposal.unknownState`, `voteBar.*`, `proposalCard.*` keys
- **Total New Keys**: 50+

### Spanish (`es.json`)
- Added `delegation.*` (22 keys) with full Spanish translations
- Added `bonds.*` (4 keys) with Spanish translations
- Fixed vote labels: `"A favor"`, `"En contra"`, `"Abstención"`
- **Total New Keys**: 50+

## 🧪 Test Coverage

### New Test Suite (`i18n-migration.test.tsx`)
Comprehensive tests with:
- ✅ English/Spanish rendering verification for all Phase 1 components
- ✅ Number formatting validation (`12345675000000n` → `"1234567.5"`)
- ✅ State badge text validation across all proposal states
- ✅ Vote bar label verification
- ✅ Countdown timer formatting tests

### Component Test Fixes
- Updated unit tests to mock `useGovernorConfig` with relative paths
- Fixed `rehype-sanitize` mock in ProposalCard tests
- Updated CountdownTimer test to properly advance system time
- Regenerated snapshots for updated component outputs

## 🔧 Technical Implementation

### Standard Pattern
All components follow the next-intl pattern:
```typescript
import { useTranslations } from "next-intl";

export function Component() {
  const t = useTranslations("namespace");
  return <div>{t("key")}</div>;
}
```

### Key Considerations
- ✅ Maintained existing component APIs and prop interfaces
- ✅ Preserved XSS protection in ProposalCard markdown rendering
- ✅ Kept number formatting using `useFormatter` for locale-aware display
- ✅ No breaking changes to component consumers
- ✅ Client components properly marked with `"use client"`
- ✅ Fallback to English for missing translations

## ✅ Validation

- [x] All existing unit tests pass
- [x] New i18n migration tests pass
- [x] Snapshot tests regenerated and verified
- [x] XSS protection tests remain intact
- [x] No TypeScript errors introduced
- [x] No breaking changes
- [x] Documentation created

## 📊 Files Changed
- **37+ files** changed
- **~2000 insertions** (+)
- **~250 deletions** (-)

## 🎯 Migration Roadmap

**Phase 1** ✅ Complete (14 components)
- Core display and modal components
- Basic page components

**Phase 2** (In Progress) - Critical UI (34 remaining)
- NavBar, NotificationBell, AddressDisplay
- Proposal-related components
- Delegation components
- Financial/treasury components
- Governance components

**Phase 3** - Polish & QA
- Complete Spanish translations
- Language switching QA
- Accessibility verification

**Phase 4** - Additional Languages
- Support for additional languages
- RTL language support (if needed)

## 📝 Related Issues

Partially addresses #1595

## 🚨 Breaking Changes

**None.** All changes are backward compatible with existing English text.

## 🔍 Review Notes

### For Language Team
- Please review Spanish translations for accuracy and cultural appropriateness
- Translation keys are organized by component/feature
- Fallback to English for missing translations ensures no broken UI
- Request any additional language support early for future phases

### For QA
- Test language switching in development environment
- Verify all 17 migrated components render correctly in both English and Spanish
- Check number formatting in different locales
- Test countdown timers across timezone boundaries
- Verify error states display correct translated messages

### For Code Reviewers
- Check translation key naming consistency
- Verify component API changes are backward compatible
- Review mock implementations in tests (especially rehype-sanitize)
- Ensure no hardcoded text remains in migrated components

## 📸 Screenshots

_Components now support English and Spanish:_
- Proposal cards display in user's preferred language
- Vote bars show localized labels (A favor / En contra / Abstención)
- Error messages appear in appropriate language
- Countdown timers use locale-aware formatting
- All modals and dialogs fully translated

## 🔗 Resources

- **Migration Status**: See `I18N_MIGRATION_STATUS.md` for detailed tracking
- **Test Suite**: `app/src/__tests__/i18n-migration.test.tsx`
- **Translation Files**:
  - English: `app/src/messages/en.json`
  - Spanish: `app/src/messages/es.json`
- **Framework Docs**: https://next-intl-docs.vercel.app/

---

## Summary

This PR represents the foundational work for complete internationalization support in nebgov. With 33% of components migrated and all core functionality translation-ready, the codebase is on track for full i18n coverage. The implementation follows best practices from the next-intl framework and maintains backward compatibility throughout.

**Next steps**: Continue with Phase 2 to migrate the remaining 34 components, complete Spanish translations, and prepare for QA and additional language support.

**Ready for review** 🚀
