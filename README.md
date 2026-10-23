# wavelength

A pass-and-play version of the party game Wavelength, as a PWA. One device is passed around:
the psychic peeks at a hidden target on the dial, gives a clue, their team turns the needle,
then the target is revealed and scored (4 / 3 / 2 points by closeness, plus 1 for the other
team if they correctly call left or right).

Everything is stored locally in the browser (`localStorage`). There is no backend and no login.
Use the Data tab to export everything to one JSON file and import it on another device.
