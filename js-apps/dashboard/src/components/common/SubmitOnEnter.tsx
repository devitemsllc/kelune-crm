// Modal and Drawer forms keep their buttons in the footer, outside the <form>.
// Browsers only submit on Enter when the form itself contains a submit control,
// so every such form renders this hidden one — otherwise Enter would work in
// forms with a single text input and silently die in the rest.
const SubmitOnEnter = () => (
  <button type="submit" tabIndex={-1} aria-hidden style={{ display: 'none' }} />
);

export default SubmitOnEnter;
