export async function classifyAttachment(attachment, deal) {
  const documentType = await detectDocumentType(attachment);

  if (documentType.confidence < 0.85) {
    await createReviewTask(attachment, deal);
    return "REVIEW_NEEDED";
  }

  const driveFile = await saveToDrive(attachment, documentType);
  await updatePipedriveDeal(deal.id, documentType, driveFile.url);
  await sendClassificationEmail(deal.ownerEmail, documentType);

  return documentType.category;
}
