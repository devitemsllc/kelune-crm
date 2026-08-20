import { Form, Switch, Space, Tooltip, Typography } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import type { FormInstance } from 'antd';
import type { NamePath } from 'antd/es/form/interface';
import type { CSSProperties, ReactNode } from 'react';

const { Text } = Typography;

interface BaseProps {
  label: ReactNode;
  // Help text, shown behind a `?` icon after the label. Mirrors the `tooltip`
  // prop on Form.Item, which is how every other field explains itself.
  tooltip?: ReactNode;
  // Override/extend the wrapper style — e.g. `{ marginBottom: 0 }`. Merged over
  // the default (spread last, so caller keys win).
  style?: CSSProperties;
  // By default the switch is a full-width block so stacked switches sit on their
  // own row. Set `inline` to render it inline-flex instead (e.g. inside a
  // horizontal toolbar row like SegmentBuilder's preview bar).
  inline?: boolean;
  // Show the state without offering to change it — the label stops toggling too,
  // so a read-only switch has no clickable surface at all.
  disabled?: boolean;
}

// Form-driven: the switch is a real Form.Item field (settings pages).
interface FormProps extends BaseProps {
  form: FormInstance;
  // NamePath so callers can target nested fields, e.g. ['settings', 'return_path'].
  name: NamePath;
  checked?: never;
  onChange?: never;
}

// Controlled: state lives outside any form (e.g. SegmentBuilder's autoRefresh).
interface ControlledProps extends BaseProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  form?: never;
  name?: never;
}

type InlineSwitchProps = FormProps | ControlledProps;

// A small Switch with a same-line, clickable label, sized to match the app's
// inline switches. The label toggles the switch on click. Two modes:
//   - Form-driven: pass `form` + `name` — the switch is a Form.Item field.
//   - Controlled:  pass `checked` + `onChange` — state lives outside the form.
const InlineSwitch = (props: InlineSwitchProps) => {
  const { label, tooltip, style, inline, disabled } = props;

  const toggle = () => {
    if (disabled) {
      return;
    }
    if (props.form) {
      props.form.setFieldValue(
        props.name,
        !props.form.getFieldValue(props.name)
      );
    } else {
      props.onChange(!props.checked);
    }
  };

  return (
    <Space
      align="center"
      style={{
        lineHeight: 0,
        marginBottom: 24,
        ...(inline ? {} : { display: 'flex', width: '100%' }),
        ...style,
      }}
    >
      {props.form ? (
        <Form.Item name={props.name} valuePropName="checked" noStyle>
          <Switch size="small" disabled={disabled} />
        </Form.Item>
      ) : (
        <Switch
          size="small"
          disabled={disabled}
          checked={props.checked}
          onChange={props.onChange}
        />
      )}
      <Text
        onClick={toggle}
        type={disabled ? 'secondary' : undefined}
        style={{ cursor: disabled ? 'default' : 'pointer' }}
      >
        {label}
      </Text>
      {tooltip ? (
        <Tooltip title={tooltip}>
          <QuestionCircleOutlined style={{ color: 'rgba(0, 0, 0, 0.45)' }} />
        </Tooltip>
      ) : null}
    </Space>
  );
};

export default InlineSwitch;
