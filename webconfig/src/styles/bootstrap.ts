import 'bootstrap-icons/font/bootstrap-icons.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';

// Slightly reduce base font size on small screens (10% smaller below 576px)
const responsiveFontStyle = document.createElement('style');
responsiveFontStyle.textContent = `@media (max-width: 576px) { html { font-size: 90%; } }`;
document.head.appendChild(responsiveFontStyle);
