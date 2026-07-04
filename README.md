# Seyda Zeynab Academy — PWA (Phase 1)

Application web progressive (PWA) pour apprendre la lecture arabe jusqu'à la
lecture du Coran, en HTML/CSS/JS pur (aucun framework, aucune dépendance de
build — tout fonctionne directement dans le navigateur).

## Ce qui est fonctionnel dans cette version  .

- **Parcours complet des 15 niveaux** affiché et verrouillé/déverrouillé
  progressivement (un niveau se débloque quand le précédent est validé).
- **Niveau 1 — Reconnaissance des lettres** : flashcards (28 lettres) +
  quiz à choix multiples avec correction immédiate. . 
- **Niveau 2 — Prononciation** : écoute audio (voir ci-dessous) +
  auto-enregistrement vocal pour s'entraîner (pas de reconnaissance vocale
  automatique hors ligne — l'élève réécoute sa propre voix pour se corriger).
- **Niveaux 3 à 15** : présents dans le parcours avec leur titre et
  description (fidèles au plan pédagogique demandé), affichés « en
  préparation » tant qu'aucun moteur d'exercice n'y est branché. Voir
  *Prochaines étapes* plus bas.
- **Profil élève** simple (nom, enfant/adulte) stocké en local.
- **Progression, badges** (un badge par niveau validé) et **tableau de bord**.
- **Génération de diplômes en PDF**, en français/anglais/italien, avec
  numéro de certificat unique, nom de l'élève, date, message d'encouragement,
  téléchargement et partage (WhatsApp/e-mail via le partage natif Android).
- **Multilingue** FR/EN/IT (interface complète), **mode clair/sombre**.
- **Stockage 100% local (IndexedDB)** : profil, progression, badges,
  diplômes, enregistrements vocaux — tout continue de fonctionner hors ligne
  après le premier chargement.
- **Sauvegarde/restauration** manuelle : export/import d'un fichier JSON
  depuis Réglages (les diplômes PDF sont inclus dans l'export).
- **Design** : palette inspirée des manuscrits coraniques enluminés
  (émeraude, or, parchemin), motif signature en étoile à 8 branches pour la
  progression et les badges.

## Ce qui n'est PAS encore fait (transparence)

- **Audio des lettres** : aucun fichier audio n'est fourni. Déposez vos
  fichiers dans `assets/audio/lettres/` — voir `assets/audio/README.txt`
  pour les noms exacts attendus. Tant qu'un fichier est absent, l'app
  affiche proprement « audio non encore ajouté », sans planter.
- **Logo réel de l'académie** : les icônes de l'app sont des placeholders
  géométriques. Voir `assets/icons/README.txt` pour les remplacer.
- **Niveaux 3 à 15** : structure et navigation prêtes, mais sans exercices
  concrets (formes des lettres, voyelles, Tajwid, sourates...).
- **Espace enseignant complet** (créer/modifier des leçons, suivre chaque
  élève, statistiques globales, tableau d'honneur) : non développé — un
  message l'indique dans Réglages. L'app actuelle est mono-élève par
  téléphone, ce qui correspond à l'usage prévu (l'élève installe l'app sur
  son propre téléphone) ; l'espace enseignant nécessitera une réflexion
  séparée (application/back-office dédié, ou compte enseignant relié à
  plusieurs profils élèves).
- **Reconnaissance vocale automatique** de la prononciation : pas de moteur
  hors-ligne fiable en JavaScript pur pour l'arabe ; remplacé pour l'instant
  par l'auto-enregistrement + réécoute.
- **Sauvegarde Google Drive / synchronisation cloud** : seule la sauvegarde
  manuelle (export/import de fichier) est implémentée.
- **Tableau d'honneur** multi-élèves : nécessite une synchronisation entre
  téléphones (cloud), donc lié au point précédent.

## Tester l'application

Un service worker (nécessaire pour le mode hors ligne) exige d'être servi
via **http(s)**, pas ouvert directement en `file://`. Depuis ce dossier :

```bash
# Python (déjà installé sur la plupart des systèmes)
python3 -m http.server 8080
# puis ouvrez http://localhost:8080 sur votre ordinateur ou téléphone
# (même réseau Wi-Fi, en remplaçant localhost par l'IP de l'ordinateur)
```

Sur Android (Chrome) : ouvrez l'URL, menu ⋮ → **Installer l'application** /
**Ajouter à l'écran d'accueil**.

## Déployer en ligne (recommandé pour un vrai test sur téléphone)

Déposez tout le contenu de ce dossier sur un hébergement statique gratuit
(GitHub Pages, Netlify, Vercel...) — HTTPS est requis pour l'installation
PWA sur Android en dehors de `localhost`.

## Structure du projet

```
index.html            Page principale
manifest.json          Manifest PWA (icônes, nom, couleurs)
service-worker.js      Mise en cache hors ligne
css/styles.css         Design (palette, typographie, composants)
js/i18n.js             Traductions FR/EN/IT de l'interface
js/levels.js           Données : 28 lettres + 15 niveaux
js/db.js               IndexedDB (profil, progression, badges, diplômes...)
js/diploma.js           Génération des diplômes PDF
js/app.js               Routeur + écrans + moteurs d'exercices
assets/icons/           Icônes PWA (placeholders à remplacer)
assets/audio/lettres/   Où déposer les fichiers audio des lettres
```

## Prochaines étapes suggérées

1. Ajouter vos fichiers audio réels (lettres, puis mots/versets).
2. Remplacer les icônes par le vrai logo de l'académie.
3. Me demander de développer les moteurs d'exercices des niveaux 3 à 15
   (chaque niveau a déjà son `engine: null` prêt à recevoir un module dans
   `js/app.js`, sur le modèle des niveaux 1 et 2).
4. Définir précisément le périmètre voulu pour l'espace enseignant
   (dashboard séparé ? multi-élèves sur un même téléphone ? synchronisation
   cloud ?) pour le concevoir correctement.
