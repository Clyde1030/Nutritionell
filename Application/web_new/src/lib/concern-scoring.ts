/**
 * Stub scorer — the real 3-tier concern algorithm (IARC/FDA/EFSA regulatory data,
 * NOVA processing classification, CSPI consumer ratings) isn't built yet. Returns
 * a neutral "no data available" breakdown so the ingredient-intel route and
 * IngredientAnalyticsTab render their existing no-data state instead of crashing.
 */
interface TierBreakdown {
  level1: {
    score: number; weight: number; weighted_contribution: number;
    veto: boolean; trigger: string; data_available: boolean;
    profile: {
      banned_or_restricted: boolean; iarc_group: string;
      southampton_six: boolean; adi_restricted: boolean;
      adi_value?: string; regulatory_notes: string; data_available: boolean;
    };
  };
  level2: {
    score: number; weight: number; weighted_contribution: number;
    nova_level: number | null; nova_label: string; data_available: boolean;
  };
  level3: {
    score: number; weight: number; weighted_contribution: number;
    cspi_rating: string; cspi_label: string; data_available: boolean;
  };
  final_score: number; risk_label: string; vetoed: boolean;
  data_coverage: { l1: boolean; l2: boolean; l3: boolean };
}

export function computeConcernScore(_ingredient: string): TierBreakdown {
  const level1Score = 0;
  const level2Score = 50;
  const level3Score = 30;
  const finalScore = Math.round(level1Score * 0.5 + level2Score * 0.3 + level3Score * 0.2);
  const riskLabel = finalScore >= 70 ? 'High Concern' : finalScore >= 40 ? 'Moderate Concern' : 'Low Concern';

  return {
    level1: {
      score: level1Score, weight: 0.5, weighted_contribution: Math.round(level1Score * 0.5),
      veto: false, trigger: 'No regulatory data available for this ingredient.', data_available: false,
      profile: {
        banned_or_restricted: false, iarc_group: 'not_evaluated',
        southampton_six: false, adi_restricted: false,
        regulatory_notes: '', data_available: false,
      },
    },
    level2: {
      score: level2Score, weight: 0.3, weighted_contribution: Math.round(level2Score * 0.3),
      nova_level: null, nova_label: 'No NOVA classification available for this ingredient.', data_available: false,
    },
    level3: {
      score: level3Score, weight: 0.2, weighted_contribution: Math.round(level3Score * 0.2),
      cspi_rating: 'Not Rated', cspi_label: 'Not Rated by CSPI', data_available: false,
    },
    final_score: finalScore,
    risk_label: riskLabel,
    vetoed: false,
    data_coverage: { l1: false, l2: false, l3: false },
  };
}
