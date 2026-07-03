COMMENT AJOUTER VOS FICHIERS AUDIO (version "à plat", sans sous-dossiers)
===========================================================================

Déposez vos fichiers audio (format .mp3 recommandé, courts, < 200 Ko
idéalement) directement à la RACINE du projet (au même niveau que
index.html), en respectant EXACTEMENT les noms de fichiers ci-dessous.
L'application les détecte automatiquement : si un fichier est absent, un
bouton "audio manquant" discret s'affiche à la place, sans faire planter
l'app.

Lettres arabes (isolées) — 28 lettres :
  audio_alif.mp3, audio_ba.mp3, audio_ta.mp3, audio_tha.mp3, audio_jim.mp3,
  audio_ha.mp3, audio_kha.mp3, audio_dal.mp3, audio_dhal.mp3, audio_ra.mp3,
  audio_zay.mp3, audio_sin.mp3, audio_shin.mp3, audio_sad.mp3, audio_dad.mp3,
  audio_ta2.mp3, audio_za.mp3, audio_ayn.mp3, audio_ghayn.mp3, audio_fa.mp3,
  audio_qaf.mp3, audio_kaf.mp3, audio_lam.mp3, audio_mim.mp3, audio_nun.mp3,
  audio_ha2.mp3, audio_waw.mp3, audio_ya.mp3

La liste complète des identifiants attendus se trouve dans levels.js
(tableau LETTERS) — c'est le fichier à modifier si vous changez les noms.

Sur GitHub (depuis le téléphone) :
1. Ouvrez votre dépôt sur github.com
2. "Add file" → "Upload files"
3. Sélectionnez vos fichiers .mp3 (vous pouvez en sélectionner plusieurs
   à la fois) et validez le commit

Après avoir ajouté des fichiers, incrémentez le numéro de version
CACHE_NAME en haut de service-worker.js pour que les téléphones déjà
installés téléchargent les nouveaux audios.
