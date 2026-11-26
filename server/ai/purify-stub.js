// De AI-koppeling geeft wiki-HTML alleen als tekst door (niets wordt gerenderd), dus geen sanitizer nodig.
export default { sanitize: (html) => String(html || '').replace(/<script[\s\S]*?<\/script>/gi, '') };
