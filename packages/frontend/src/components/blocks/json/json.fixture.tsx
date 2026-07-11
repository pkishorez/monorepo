import { useState } from 'react';
import { JsonEditor, JsonViewer } from '.';

const value = {
  campaign: { id: 'campaign_01', active: true },
  discounts: [{ type: 'percentage', value: 20 }],
};

function EditableJson() {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  return <JsonEditor value={text} onChange={setText} maxHeight="24rem" />;
}

export default {
  editable: <EditableJson />,
  'read only': (
    <JsonEditor
      value={JSON.stringify(value, null, 2)}
      readOnly
      maxHeight="24rem"
    />
  ),
  viewer: <JsonViewer value={value} label="Payload" maxHeight="24rem" />,
};
