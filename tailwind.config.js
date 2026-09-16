/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
  	extend: {
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			cis: {
  				orange: {
  					DEFAULT: 'var(--cis-orange)',
  					hover: 'var(--cis-orange-hover)',
  					press: 'var(--cis-orange-press)',
  					shadow: 'var(--cis-orange-shadow)',
  					text: 'var(--cis-orange-text)',
  					deep: 'var(--cis-orange-deep)'
  				},
  				ember: {
  					DEFAULT: 'var(--cis-ember)',
  					tint: 'var(--cis-ember-tint)'
  				},
  				sage: {
  					DEFAULT: 'var(--cis-sage)',
  					hover: 'var(--cis-sage-hover)',
  					press: 'var(--cis-sage-press)',
  					tint: 'var(--cis-sage-tint)',
  					text: 'var(--cis-sage-text)',
  					ink: 'var(--cis-sage-ink)'
  				},
  				apricot: {
  					DEFAULT: 'var(--cis-apricot)',
  					tint: 'var(--cis-apricot-tint)'
  				},
  				page: 'var(--cis-page)',
  				paper: {
  					DEFAULT: 'var(--cis-paper)',
  					light: 'var(--cis-paper-light)'
  				},
  				rule: {
  					DEFAULT: 'var(--cis-rule)',
  					soft: 'var(--cis-rule-soft)'
  				},
  				track: 'var(--cis-track)',
  				ink: {
  					DEFAULT: 'var(--cis-ink)',
  					dark: 'var(--cis-ink-dark)',
  					muted: 'var(--cis-ink-muted)',
  					'on-dark': 'var(--cis-ink-on-dark)',
  					'on-dark-muted': 'var(--cis-ink-on-dark-muted)'
  				},
  				board: {
  					DEFAULT: 'var(--cis-board)',
  					tab: 'var(--cis-board-tab)',
  					hole: 'var(--cis-board-hole)'
  				}
  			}
  		},
  		fontFamily: {
  			'cis-display': 'var(--cis-font-display)',
  			'cis-body': 'var(--cis-font-body)'
  		},
  		fontSize: {
  			'cis-xs': 'var(--cis-text-xs)',
  			'cis-sm': 'var(--cis-text-sm)',
  			'cis-base': 'var(--cis-text-base)',
  			'cis-md': 'var(--cis-text-md)',
  			'cis-lg': 'var(--cis-text-lg)',
  			'cis-xl': 'var(--cis-text-xl)',
  			'cis-display-md': 'var(--cis-display-md)',
  			'cis-display-lg': 'var(--cis-display-lg)'
  		},
  		borderRadius: {
  			'cis-chip': 'var(--cis-radius-chip)',
  			'cis-box': 'var(--cis-radius-box)',
  			'cis-sheet': 'var(--cis-radius-sheet)',
  			'cis-shell': 'var(--cis-radius-shell)',
  			'cis-pill': 'var(--cis-radius-pill)'
  		},
  		spacing: {
  			'cis-1': 'var(--cis-space-1)',
  			'cis-2': 'var(--cis-space-2)',
  			'cis-3': 'var(--cis-space-3)',
  			'cis-4': 'var(--cis-space-4)',
  			'cis-5': 'var(--cis-space-5)',
  			'cis-6': 'var(--cis-space-6)',
  			'cis-tap-min': 'var(--cis-tap-min)',
  			'cis-tap-primary': 'var(--cis-tap-primary)'
  		},
  		boxShadow: {
  			'cis-sheet': 'var(--cis-shadow-sheet)',
  			'cis-shell': 'var(--cis-shadow-shell)',
  			'cis-press': 'var(--cis-shadow-press)'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}