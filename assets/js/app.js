const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('.site-nav');

function closeMenu() {
	if (!menuButton || !nav) return;
	nav.classList.remove('open');
	menuButton.setAttribute('aria-expanded', 'false');
}

if (menuButton && nav) {
	menuButton.addEventListener('click', () => {
		const isOpen = nav.classList.toggle('open');
		menuButton.setAttribute('aria-expanded', String(isOpen));
	});

	nav.addEventListener('click', (event) => {
		if (event.target.closest('a')) closeMenu();
	});

	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape') closeMenu();
	});

	window.addEventListener('resize', () => {
		if (window.innerWidth > 920) closeMenu();
	});
}

const contactForm = document.querySelector('#contactForm');
const formNote = document.querySelector('#formNote');

if (contactForm && formNote) {
	contactForm.addEventListener('submit', (event) => {
		if (!contactForm.checkValidity()) {
			event.preventDefault();
			formNote.textContent = 'Revisa los campos marcados antes de enviar.';
			formNote.classList.add('is-error');
			contactForm.reportValidity();
			return;
		}

		const submitButton = contactForm.querySelector('button[type="submit"]');
		if (submitButton) {
			submitButton.disabled = true;
			submitButton.textContent = 'Enviando...';
		}

		formNote.textContent = 'Enviando consulta...';
		formNote.classList.remove('is-error');
	});
}

const revealBlocks = document.querySelectorAll('.reveal');

if (revealBlocks.length) {
	const revealObserver = new IntersectionObserver(
		(entries, observer) => {
			entries.forEach((entry) => {
				if (!entry.isIntersecting) return;
				entry.target.classList.add('is-visible');
				observer.unobserve(entry.target);
			});
		},
		{
			threshold: 0.18,
			rootMargin: '0px 0px -40px 0px',
		}
	);

	revealBlocks.forEach((block) => {
		revealObserver.observe(block);
	});
}