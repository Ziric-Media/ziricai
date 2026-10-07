import { segmentFromCompanyRecord } from '../../shared/organisationTaxonomy.js';

export function countCompaniesByOrganisationType(companies, organisationType) {
  return companies.filter(
    (c) => segmentFromCompanyRecord(c).organisationType === organisationType
  ).length;
}
