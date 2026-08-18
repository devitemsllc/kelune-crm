import { Button } from 'antd';
import { Link } from 'react-router-dom';
import { __ } from '@wordpress/i18n';
import ErrorState from '../components/common/ErrorState';

const NotFound = () => (
  <ErrorState
    status="404"
    title="404"
    subTitle={__('Sorry, the page you visited does not exist.', 'kelune-crm')}
    extra={
      <Link to="/contacts">
        <Button type="primary">{__('Back to Contacts', 'kelune-crm')}</Button>
      </Link>
    }
  />
);

export default NotFound;
