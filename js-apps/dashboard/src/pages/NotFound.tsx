import { Button } from 'antd';
import { Link } from 'react-router-dom';
import { __ } from '@wordpress/i18n';
import ErrorState from '../components/common/ErrorState';

const NotFound = () => (
  <ErrorState
    status="404"
    title={__('Not found', 'kelune-crm')}
    subTitle={__('Sorry, the page you visited does not exist.', 'kelune-crm')}
    extra={
      // `/` resolves to the landing route, so the way out is never a second wall.
      <Link to="/">
        <Button type="primary">{__('Back to Home', 'kelune-crm')}</Button>
      </Link>
    }
  />
);

export default NotFound;
