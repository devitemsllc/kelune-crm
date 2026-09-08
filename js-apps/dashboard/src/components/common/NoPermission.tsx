import React from 'react';
import { Button } from 'antd';
import { Link } from 'react-router-dom';
import { __ } from '@wordpress/i18n';
import ErrorState from './ErrorState';

/** The state shown in place of a page the current role may not open. */
const NoPermission = () => (
  <ErrorState
    status="403"
    title={__('No permission', 'kelune-crm')}
    subTitle={__(
      'Sorry, you do not have permission to access this page.',
      'kelune-crm'
    )}
    extra={
      // `/` resolves to the landing route, so the way out is never a second wall.
      <Link to="/">
        <Button type="primary">{__('Back to Home', 'kelune-crm')}</Button>
      </Link>
    }
  />
);

export default NoPermission;
