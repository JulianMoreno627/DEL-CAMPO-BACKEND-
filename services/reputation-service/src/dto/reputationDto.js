/** DTOs of reputation-service and their mapping from / to proto/reputation.proto. */

export function toRatingDto(rating) {
  const r = rating.toJSON();
  return {
    id: r.id,
    version: r.version,
    updatedAt: r.updatedAt,
    orderId: r.orderId,
    fromUserId: r.fromUserId,
    toUserId: r.toUserId,
    scores: r.scores,
    comment: r.comment,
  };
}

export const toReputationDto = ({ total, score, level, byCriterion, recent }) => ({
  total,
  score,
  level,
  byCriterion,
  recent: recent.map(({ scores, comment, date }) => ({ scores, comment: comment ?? '', date })),
});

export const rateFromMessage = ({ orderId, scores, comment }) => ({ orderId, scores: { ...scores }, comment });
