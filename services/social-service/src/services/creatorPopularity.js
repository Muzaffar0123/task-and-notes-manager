function creatorLevel(score) {
  if (score >= 5000) return "Diamond";
  if (score >= 1500) return "Platinum";
  if (score >= 500) return "Gold";
  if (score >= 200) return "Silver";
  if (score >= 50) return "Bronze";
  return "New Creator";
}

module.exports = { creatorLevel };
