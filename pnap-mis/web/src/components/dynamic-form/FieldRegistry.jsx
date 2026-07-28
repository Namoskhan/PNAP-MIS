// FieldRegistry — type → component map. Adding a new dynamic field
// type means writing one component and registering it here. Unknown
// types fall back to TextField with a "(unsupported type X)" hint
// rather than crashing the whole form.
import TextField from './fields/TextField';
import TextAreaField from './fields/TextAreaField';
import NumberField from './fields/NumberField';
import DateField from './fields/DateField';
import BoolField from './fields/BoolField';
import SelectField from './fields/SelectField';
import MultiSelectField from './fields/MultiSelectField';
import MemberRefField from './fields/MemberRefField';

const REGISTRY = {
  TEXT: TextField,
  TEXTAREA: TextAreaField,
  NUMBER: NumberField,
  INT: NumberField,
  CURRENCY: NumberField,
  DATE: DateField,
  BOOL: BoolField,
  SELECT: SelectField,
  MULTISELECT: MultiSelectField,
  MEMBER_REF: MemberRefField,
};

export function getFieldComponent(type) {
  return REGISTRY[type] || TextField;
}

export default REGISTRY;
