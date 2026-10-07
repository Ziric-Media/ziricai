import { ORGANISATION_TYPE } from '../../shared/organisationTaxonomy.js';
import { renderCompanies } from './companies.js';

export function renderGovernmentOrganisations(container) {
  return renderCompanies(container, { organisationType: ORGANISATION_TYPE.GOVERNMENT });
}

export function renderPublicServiceOrganisations(container) {
  return renderCompanies(container, {
    organisationType: ORGANISATION_TYPE.POLITICAL_PUBLIC_SERVICE,
  });
}
