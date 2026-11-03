import type { LoaderOptions } from "@medusajs/framework/types"
import type { ProductAttributesOptions } from "../../../types"
import { resolveModuleOptions } from "../../../config"
import { registerNativeValidation } from "../../../workflows/native-validation"

export default async function loadNativeValidation({
  options,
}: LoaderOptions<ProductAttributesOptions>) {
  if (resolveModuleOptions(options).register_native_hooks)
    registerNativeValidation()
}
